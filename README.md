# 🤖 Luath WhatsApp AI Agent

WhatsApp AI Agent canggih berbasis **Llama 3.3 (Groq)** yang dirancang untuk menjadi asisten serbaguna, mulai dari pencarian internet hingga download media otomatis.

## ✨ Fitur Utama

-   **🧠 Smart Brain (Llama 3.3)**: Menggunakan model terbaru dari Groq untuk respon yang cepat dan cerdas.
-   **🔍 Search Internet (Exa AI)**: Mencari informasi terkini di internet secara real-time dengan filter neural search.
-   **📥 All-in-One Downloader**: Download video/audio dari YouTube, TikTok, Instagram, Twitter, dan lainnya secara otomatis.
-   **🎨 Sticker Creator**:
    -   Kirim gambar/GIF dengan caption `/s` untuk membuat stiker secara instan.
    -   Minta AI untuk mencarikan gambar dan menjadikannya stiker.
    -   Support stiker bergerak (video ke stiker).
-   **💾 Persistent Memory**: AI mengingat fakta-fakta penting tentang kamu untuk pengalaman chat yang lebih personal.
-   **📊 Quota System**: Limit harian 50 pesan per user untuk menjaga stabilitas, tersimpan secara permanen.
-   **⛅ Weather Tool**: Info cuaca akurat di berbagai kota.
-   **⚡ Fast Commands**:
    -   `/status`: Cek penggunaan kuota dan statistik bot.
    -   `/s`: Konversi gambar/video ke stiker secara instan.

## 🛠️ Persiapan & Instalasi

### 1. Prasyarat
-   Node.js v20 atau lebih baru.
-   API Keys (Daftar gratis di masing-masing website):
    -   [Groq API Key](https://console.groq.com/) (AI Engine)
    -   [Exa AI Key](https://exa.ai/) (Search Tool)

### 2. Instalasi
Clone repository dan install dependencies:
```bash
npm install
```

### 3. Konfigurasi
Buat file `.env` (copy dari `.env.example`) dan isi semua API key:
```env
# AI Config
GROQ_API_KEY=gsk_xxx
GROQ_MODEL=llama-3.3-70b-versatile

# Tools Config
EXA_API_KEY=exa_xxx

# Bot Config
BOT_NAME=Luath
OWNER_NAME=Lang
BOT_PREFIX=/
MAX_HISTORY=10
```

### 4. Jalankan Bot
Mode development (dengan auto-restart):
```bash
npm run dev
```

Scan QR Code yang muncul di terminal menggunakan WhatsApp kamu (Linked Devices).

## 📑 Perintah Bot

| Command | Deskripsi |
| :--- | :--- |
| `/status` | Menampilkan kuota harian, uptime, dan info model AI. |
| `/s` | (Caption/Reply Gambar) Membuat stiker secara instan. |
| `[Text Bebas]` | Mengobrol dengan AI, minta cari info, atau minta download media. |

## 🛡️ Keamanan & Privasi
-   **Limits**: Data kuota disimpan di `limits.json`.
-   **Memory**: Fakta tentang user disimpan di `memory.json`.
-   **Auth**: Sesi WhatsApp disimpan aman di folder `./auth_info`.

## 🤝 Kontribusi
Project ini dikembangkan oleh **Lang**. Jika kamu ingin berkontribusi atau menemukan bug, silakan hubungi owner.

---
*Dibuat dengan ❤️ menggunakan Baileys & Groq.*
