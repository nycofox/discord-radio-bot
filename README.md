# Discord Radio Bot

A small Discord bot that joins a voice channel and relays an internet radio stream. It can optionally read ICY metadata to update presence and post "now playing" messages in a text channel.

## Requirements

- Node.js
- A Discord bot token with access to your server
- ffmpeg available on the system path

## Setup

1) Copy the example environment file:

```
cp .env.example .env
```

2) Edit `.env` and set the required values:

Required:
- `DISCORD_TOKEN`: your bot token
- `GUILD_ID`: the target server (guild) ID
- `VOICE_CHANNEL_ID`: the voice channel ID to join
- `STREAM_URL`: the radio stream URL (http/https)

Optional:
- `NOWPLAYING_TEXT_CHANNEL_ID`: a text channel ID to post now playing updates
- `METADATA_PRESENCE_INTERVAL`: seconds between presence refreshes when metadata exists (default: 20)

3) Start the bot:

```
docker compose up --build -d
```

## Notes

- The bot will attempt to reconnect to the voice channel if disconnected.
- If the station does not provide ICY metadata, presence and now playing updates will be skipped.
