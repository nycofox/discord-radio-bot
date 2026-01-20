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

## Getting Discord Tokens and IDs

### Bot Token

1) Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create a New Application.
2) Open the application and go to **Bot** in the left sidebar.
3) Click **Add Bot** if you haven't already.
4) Under **Token**, click **Reset Token** (or **View Token**) and copy the bot token.
5) Paste the value into `DISCORD_TOKEN` in your `.env` file.

### Guild (Server) ID

1) In the Discord client, open **User Settings → Advanced** and enable **Developer Mode**.
2) Right-click your server icon and choose **Copy Server ID**.
3) Paste the value into `GUILD_ID` in your `.env` file.

### Voice/Text Channel IDs

1) With **Developer Mode** enabled, right-click the target voice channel and choose **Copy Channel ID**.
2) Paste the value into `VOICE_CHANNEL_ID` in your `.env` file.
3) For now playing updates, right-click the text channel and choose **Copy Channel ID**.
4) Paste the value into `NOWPLAYING_TEXT_CHANNEL_ID` in your `.env` file.


## Notes

- The bot will attempt to reconnect to the voice channel if disconnected.
- If the station does not provide ICY metadata, presence and now playing updates will be skipped.
