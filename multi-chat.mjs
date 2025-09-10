// Multi-chat Twitch + YouTube + TikTok 
// Autor: Matheus Albuquerque (Bucherche.Coder)
// Rodar com: node multi-chat.mjs
// Abra no navegador do PC ou celular: http://IP_DO_PC:PORTA

import express from "express";
import http from "http";
import { Server } from "socket.io";
import tmi from "tmi.js";
import { google } from "googleapis";
import { WebcastPushConnection } from "tiktok-live-connector";
import net from "net";
import os from "os";
import { exec } from "child_process";

// ================= CONFIGURAÇÕES =================
const TWITCH_CHANNEL = "NOME_DO_SEU_CANAL_TWITCH"; // coloque o nome do seu canal Twitch.
const YT_CHANNEL_ID = "ID_DO_SEU_CANAL_YOUTUBE"; // coloque o ID do canal YouTube (não o nome, veja na URL do canal).
const TIKTOK_USERNAME = "SEU_USUARIO_TIKTOK"; // coloque seu usuário TikTok.
const YT_API_KEY = "SUA_CHAVE_AQUI"; // sua chave de API do YouTube. Obtenha em: https://console.developers.google.com/apis/credentials

// ================= LIMITE DE COTAS =================
const YOUTUBE_DAILY_QUOTA = 10000;
let youtubeCallCount = 0;
const YOUTUBE_INTERVAL_MS = Math.floor((24 * 60 * 60 * 1000) / YOUTUBE_DAILY_QUOTA);

// ================= FUNÇÃO DE LOG LIMPO =================
function logError(platform, message) {
  console.log(`❌ [${platform}] ${message}`);
}

// ================= FUNÇÃO PORTA LIVRE =================
async function findFreePort(startPort) {
  let port = startPort;
  while (true) {
    const isFree = await new Promise(resolve => {
      const tester = net.createServer()
        .once("error", () => resolve(false))
        .once("listening", () => tester.once("close", () => resolve(true)).close())
        .listen(port);
    });
    if (isFree) return port;
    port++;
  }
}

// ================= FUNÇÃO IP LOCAL =================
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const i of iface) {
      if (i.family === 'IPv4' && !i.internal) {
        return i.address;
      }
    }
  }
  return 'localhost';
}

// ================= SERVIDOR =================
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Multi Chat</title>
        <style>
          body { font-family: Arial; background: #18142f; color: #eee; padding:0; margin:0; transition: background 0.3s, color 0.3s; }
          .msg { margin: 5px 0; padding:8px 12px; border-radius:8px; display:flex; align-items:center; box-shadow: 0 2px 6px rgba(0,0,0,0.5); transition: background 0.3s, color 0.3s; }
          .twitch { color: #9146FF; background: rgba(145,70,255,0.15); }
          .youtube { color: #FF0000; background: rgba(255,0,0,0.15); }
          .tiktok { color: #69C9D0; background: rgba(105,201,208,0.15); }
          h2 { text-align:center; padding:10px; background: #18142f; margin:0; color:#eee; transition: background 0.3s, color 0.3s; }
          #chat { padding:10px; max-height:90vh; overflow-y:auto; }
          .mode-toggle { position:fixed; top:10px; right:10px; padding:5px 10px; cursor:pointer; background:#333; color:#fff; border:none; border-radius:4px; transition: background 0.3s, color 0.3s; }
        </style>
      </head>
      <body>
        <button class="mode-toggle" onclick="toggleMode()">🌗 Mudar Modo</button>
        <h2>💬 Multi Chat — Twitch + YouTube + TikTok</h2>
        <div id="chat"></div>
        <script src="/socket.io/socket.io.js"></script>
        <script>
          let darkMode = true;
          function toggleMode() {
            darkMode = !darkMode;
            if(darkMode){
              document.body.style.background = '#18142f';
              document.body.style.color = '#eee';
              document.querySelector('h2').style.background = '#18142f';
              document.querySelector('h2').style.color = '#eee';
              document.querySelector('.mode-toggle').style.background = '#333';
              document.querySelector('.mode-toggle').style.color = '#fff';
              document.querySelectorAll('.msg').forEach(el=>{
                if(el.classList.contains('twitch')) el.style.background = 'rgba(145,70,255,0.15)';
                if(el.classList.contains('youtube')) el.style.background = 'rgba(255,0,0,0.15)';
                if(el.classList.contains('tiktok')) el.style.background = 'rgba(105,201,208,0.15)';
              });
            } else {
              document.body.style.background = '#ffffff';
              document.body.style.color = '#111';
              document.querySelector('h2').style.background = '#f5f5f5';
              document.querySelector('h2').style.color = '#111';
              document.querySelector('.mode-toggle').style.background = '#ccc';
              document.querySelector('.mode-toggle').style.color = '#111';
              document.querySelectorAll('.msg').forEach(el=>{
                if(el.classList.contains('twitch')) el.style.background = 'rgba(145,70,255,0.4)';
                if(el.classList.contains('youtube')) el.style.background = 'rgba(255,0,0,0.4)';
                if(el.classList.contains('tiktok')) el.style.background = 'rgba(105,201,208,0.4)';
              });
            }
          }

          const socket = io();
          const chat = document.getElementById('chat');
          socket.on('chat', data => {
            const div = document.createElement('div');
            div.className = 'msg ' + data.platform;
            let emoji = '';
            if(data.platform === 'twitch') emoji = '🎮';
            if(data.platform === 'youtube') emoji = '▶️';
            if(data.platform === 'tiktok') emoji = '🎵';
            div.innerText = emoji + " " + data.user + ": " + data.msg;
            chat.appendChild(div);
            window.scrollTo(0, document.body.scrollHeight);
          });
        </script>
      </body>
    </html>
  `);
});

// ================= TWITCH =================
const twitchClient = new tmi.Client({ channels: [TWITCH_CHANNEL] });
twitchClient.connect();
twitchClient.on("connected", () => console.log("✅ Conectado ao chat da Twitch"));
twitchClient.on("message", (channel, tags, message, self) => {
  if (self) return;
  io.emit("chat", { platform: "twitch", user: tags["display-name"], msg: message });
});
twitchClient.on("error", (err) => logError("Twitch", err.message));

// ================= YOUTUBE =================
const youtube = google.youtube({ version: "v3", auth: YT_API_KEY });
let cachedLiveChatId = null;
let lastFetchedTime = 0;

async function getLiveChatId() {
  try {
    const now = Date.now();
    if (cachedLiveChatId && now - lastFetchedTime < 60000) return cachedLiveChatId;

    const res = await youtube.search.list({
      part: "id",
      channelId: YT_CHANNEL_ID,
      eventType: "live",
      type: "video"
    });
    if (res.data.items.length === 0) return null;
    const liveId = res.data.items[0].id.videoId;
    const live = await youtube.videos.list({ part: "liveStreamingDetails", id: liveId });
    cachedLiveChatId = live.data.items[0].liveStreamingDetails.activeLiveChatId;
    lastFetchedTime = now;
    return cachedLiveChatId;
  } catch {
    logError("YouTube", "Nenhum chat ativo do YouTube encontrado. Tentando novamente...");
    return null;
  }
}

async function pollYouTubeChat() {
  let nextPageToken = "";
  setInterval(async () => {
    if (youtubeCallCount >= YOUTUBE_DAILY_QUOTA) return;

    try {
      const chatId = await getLiveChatId();
      if (!chatId) {
        logError("YouTube", "Nenhum chat ativo do YouTube encontrado. Tentando novamente...");
        return;
      }
      const res = await youtube.liveChatMessages.list({
        liveChatId: chatId,
        part: "snippet,authorDetails",
        pageToken: nextPageToken
      });
      youtubeCallCount++;

      // ✅ Status de conexão do YouTube
      console.log("✅ Conectado ao chat do YouTube");

      res.data.items.forEach(item => {
        io.emit("chat", {
          platform: "youtube",
          user: item.authorDetails.displayName,
          msg: item.snippet.displayMessage
        });
      });
      nextPageToken = res.data.nextPageToken || "";
    } catch {
      logError("YouTube", "Erro ao pegar mensagens do chat");
    }
  }, YOUTUBE_INTERVAL_MS);
}

pollYouTubeChat();

// ================= TIKTOK =================
const tiktokConnection = new WebcastPushConnection(TIKTOK_USERNAME);

async function startTikTok() {
  try {
    await tiktokConnection.connect();
    console.log("✅ Conectado ao chat do TikTok");

    tiktokConnection.on("chat", (data) => {
      io.emit("chat", { platform: "tiktok", user: data.uniqueId, msg: data.comment });
    });

    tiktokConnection.on("connected", () => console.log("✅ TikTok conectado"));
    tiktokConnection.on("disconnected", () => logError("TikTok", "Desconectado do chat"));
    tiktokConnection.on("error", () => logError("TikTok", "Erro ao conectar no chat"));
  } catch {
    logError("TikTok", "Erro ao conectar no TikTok");
  }
}

startTikTok();

// ================= START SERVIDOR COM PORTA DINÂMICA =================
(async () => {
  const PORT = await findFreePort(3000);
  const LOCAL_IP = getLocalIP();
  server.listen(PORT, '0.0.0.0', () => {
    const url = `http://${LOCAL_IP}:${PORT}`;
    console.log(`✅ Multi-chat rodando em ${url}`);

    exec(`echo ${url} | clip`, (err) => {
      if (err) {
        logError("Servidor", "Não foi possível copiar o link para a área de transferência");
      } else {
        console.log("📋 Link copiado para a área de transferência! Agora é só colar no navegador do celular.");
      }
    });
  });
})();

