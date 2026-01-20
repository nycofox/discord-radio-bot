import "dotenv/config";
import { Client, GatewayIntentBits, ActivityType } from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus
} from "@discordjs/voice";
import { spawn } from "node:child_process";
import prism from "prism-media";
import { listenIcyStreamTitle } from "./metadata.js";

const {
  DISCORD_TOKEN,
  GUILD_ID,
  VOICE_CHANNEL_ID,
  STREAM_URL,
  METADATA_PRESENCE_INTERVAL = "20",
  NOWPLAYING_TEXT_CHANNEL_ID
} = process.env;

if (!DISCORD_TOKEN || !GUILD_ID || !VOICE_CHANNEL_ID || !STREAM_URL) {
  console.error("Missing required env vars. Need DISCORD_TOKEN, GUILD_ID, VOICE_CHANNEL_ID, STREAM_URL.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

let lastTitle = null;
let nowPlayingMsgCooldown = 0;
let shuttingDown = false;
let reconnecting = false;
let restartTimer = null;
let restartDelayMs = 1000;
const MAX_RESTART_DELAY_MS = 30_000;

function startFfmpeg(streamUrl) {
  // ffmpeg decodes to raw PCM (s16le 48kHz stereo) which we then Opus-encode for Discord
  const ffmpeg = spawn("ffmpeg", [
    "-reconnect", "1",
    "-reconnect_streamed", "1",
    "-reconnect_delay_max", "5",
    "-i", streamUrl,
    "-analyzeduration", "0",
    "-loglevel", "warning",
    "-f", "s16le",
    "-ar", "48000",
    "-ac", "2",
    "pipe:1"
  ], { stdio: ["ignore", "pipe", "pipe"] });

  ffmpeg.stderr.on("data", (d) => console.error("[ffmpeg]", d.toString().trim()));
  ffmpeg.on("close", (code) => console.error(`ffmpeg exited with code ${code}`));

  const opus = new prism.opus.Encoder({ rate: 48000, channels: 2, frameSize: 960 });

  const opusStream = ffmpeg.stdout.pipe(opus);
  return { ffmpeg, opusStream };
}

async function setPresence(title) {
  try {
    client.user?.setPresence({
      activities: [{ name: title, type: ActivityType.Listening }],
      status: "online"
    });
  } catch (e) {
    console.error("Failed to set presence:", e);
  }
}

async function maybePostNowPlaying(title) {
  if (!NOWPLAYING_TEXT_CHANNEL_ID) return;

  // simple cooldown so you don't spam a channel if metadata flips around
  const now = Date.now();
  if (now < nowPlayingMsgCooldown) return;
  nowPlayingMsgCooldown = now + 60_000; // 60s

  try {
    const channel = await client.channels.fetch(NOWPLAYING_TEXT_CHANNEL_ID);
    if (channel?.isTextBased()) {
      await channel.send(`Now playing: **${title}**`);
    }
  } catch (e) {
    console.error("Failed to post now playing:", e);
  }
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  const channel = await guild.channels.fetch(VOICE_CHANNEL_ID);

  if (!channel?.isVoiceBased()) {
    console.error("VOICE_CHANNEL_ID is not a voice-based channel.");
    process.exit(1);
  }

  const connect = () =>
    joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false
    });

  const attachConnectionHandlers = (voiceConnection) => {
    voiceConnection.on("stateChange", (_, newState) => {
      if (newState.status !== VoiceConnectionStatus.Disconnected || shuttingDown || reconnecting) return;
      reconnecting = true;
      console.warn("Voice connection disconnected. Attempting to reconnect.");
      try { voiceConnection.destroy(); } catch {}
      connection = connect();
      connection.subscribe(player);
      attachConnectionHandlers(connection);
      reconnecting = false;
    });
  };

  let connection = connect();

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play }
  });

  connection.subscribe(player);

  // Start audio stream
  let { ffmpeg, opusStream } = startFfmpeg(STREAM_URL);

  const resource = createAudioResource(opusStream, { inputType: StreamType.Opus });
  player.play(resource);

  player.on(AudioPlayerStatus.Playing, () => console.log("Audio is playing."));
  player.on("error", (err) => {
    console.error("Audio player error:", err);
  });

  const restartStream = () => {
    if (shuttingDown || restartTimer) return;
    console.log(`Restarting stream in ${restartDelayMs}ms...`);
    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (shuttingDown) return;
      try { ffmpeg.kill("SIGKILL"); } catch {}
      const restarted = startFfmpeg(STREAM_URL);
      ffmpeg = restarted.ffmpeg;
      opusStream = restarted.opusStream;
      ffmpeg.on("close", restartStream);
      const r = createAudioResource(opusStream, { inputType: StreamType.Opus });
      player.play(r);
      restartDelayMs = Math.min(restartDelayMs * 2, MAX_RESTART_DELAY_MS);
    }, restartDelayMs);
  };

  const resetRestartDelay = () => {
    restartDelayMs = 1000;
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  };

  ffmpeg.on("close", restartStream);
  player.on(AudioPlayerStatus.Playing, resetRestartDelay);

  attachConnectionHandlers(connection);

  // Metadata listener (optional; depends on station support)
  const meta = listenIcyStreamTitle(STREAM_URL, {
    onTitle: async (title) => {
      if (!title || title === lastTitle) return;
      lastTitle = title;
      console.log("Now playing:", title);
      await setPresence(`Now playing: ${title}`);
      await maybePostNowPlaying(title);
    },
    onError: (err) => {
      console.warn("Metadata not available / error:", err.message);
    }
  });

  // If you want to “refresh” presence periodically even without changes:
  const parsedInterval = Number(METADATA_PRESENCE_INTERVAL);
  const intervalMs = Number.isFinite(parsedInterval) && parsedInterval > 0 ? parsedInterval * 1000 : 20_000;
  const interval = setInterval(() => {
    if (lastTitle) setPresence(`Now playing: ${lastTitle}`);
  }, intervalMs);

  // Clean shutdown
  const shutdown = () => {
    shuttingDown = true;
    clearInterval(interval);
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    meta.stop();
    try { ffmpeg.kill("SIGKILL"); } catch {}
    try { connection.destroy(); } catch {}
    client.destroy();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
});

client.login(DISCORD_TOKEN);
