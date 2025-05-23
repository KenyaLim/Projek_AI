const API_KEY = '080c847923ad48d79f1142215252502';
const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');

const aliases = {
  "jogja": "yogyakarta", "joga": "yogyakarta", "jkt": "jakarta",
  "bdg": "bandung", "sby": "surabaya", "makasar": "makassar",
  "makassar": "makassar", "medan": "medan", "pekalongan": "pekalongan"
};

userInput.addEventListener('keypress', e => e.key === 'Enter' && sendMessage());

function addMessage(message, isUser = false) {
    const div = document.createElement('div');
    div.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
    div.innerHTML = message;
    
    // Ensure message is fully rendered before scrolling
    requestAnimationFrame(() => {
        chatMessages.appendChild(div);
        // Delay scroll to after animation
        setTimeout(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 100);
    });
}

function translateCondition(condition) {
  const dict = {
    "sunny": "cerah", "clear": "cerah", "partly cloudy": "berawan sebagian",
    "cloudy": "berawan", "overcast": "mendung", "mist": "berkabut",
    "patchy rain possible": "kemungkinan hujan ringan", "light rain": "hujan ringan",
    "moderate rain": "hujan sedang", "heavy rain": "hujan lebat",
    "thunderstorm": "badai petir", "light drizzle": "gerimis ringan"
  };
  return dict[condition.toLowerCase()] || condition;
}

function extractCity(text) {
  const regex = /(?:di|ke|dari|kota)\s+([a-z\s]+)/i;
  const match = text.match(regex);
  if (match) {
    const raw = match[1].trim().toLowerCase().split(' ')[0];
    if (aliases[raw]) return aliases[raw]; // alias yg dikenal
    return raw; // fallback: anggap ini nama kota langsung
  }

  // fallback kedua: cari kota dari semua alias yang diketahui
  const all = Object.keys(aliases).concat(Object.values(aliases));
  for (const city of all) {
    if (text.toLowerCase().includes(city)) return aliases[city] || city;
  }

  return null;
}


function extractDateFromText(text) {
  const today = new Date();
  text = text.toLowerCase();

  if (/besok/.test(text)) today.setDate(today.getDate() + 1);
  else if (/lusa/.test(text)) today.setDate(today.getDate() + 2);
  else if (/(\d+)\s*hari\s*(lagi|ke depan)/.test(text)) {
    const days = parseInt(text.match(/(\d+)\s*hari\s*(lagi|ke depan)/)[1]);
    today.setDate(today.getDate() + days);
  } else if (/(\d+)\s*hari\s*lalu/.test(text)) {
    const days = parseInt(text.match(/(\d+)\s*hari\s*lalu/)[1]);
    today.setDate(today.getDate() - days);
  } else if (/kemarin/.test(text)) {
    today.setDate(today.getDate() - 1);
  } else {
    return null;
  }

  const maxForecast = new Date();
  maxForecast.setDate(maxForecast.getDate() + 2);
  if (today > maxForecast) return 'future-limit-exceeded';

  return today.toISOString().split('T')[0];
}

function detectIntent(text) {
  const lower = text.toLowerCase();
  if (/gempa|goyang|terasa|earthquake/.test(lower)) return 'earthquake';
  if (/banjir|tornado|angin kencang|cuaca ekstrem|bencana/i.test(lower)) return 'disaster';
  if (/hujan|ujan/.test(lower)) return 'rain'; // Intent khusus hujan
  if (/cuaca|panas|berawan|mendung/.test(lower)) return 'weather';
  return 'unknown';
}


async function fetchWeather(city, dateStr, intent) {
  const endpoint = dateStr
    ? `https://api.weatherapi.com/v1/${dateStr < new Date().toISOString().split('T')[0] ? 'history' : 'forecast'}.json?key=${API_KEY}&q=${city}&dt=${dateStr}&lang=id`
    : `https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${city}&lang=id`;

  const res = await fetch(endpoint);
  const data = await res.json();

  if (data.error) {
    addMessage(`Maaf, ${data.error.message.toLowerCase()}`);
    return;
  }

  let weather = {};
  if (dateStr) {
    const forecast = data.forecast.forecastday[0].day;
    weather = {
      city: data.location.name,
      temp: forecast.avgtemp_c,
      condition: translateCondition(forecast.condition.text),
      isRaining: forecast.daily_chance_of_rain > 50
    };
  } else {
    const current = data.current;
    const conditionText = current.condition.text.toLowerCase();
    const isRaining = ['hujan', 'rain', 'shower', 'drizzle', 'gerimis'].some(word => conditionText.includes(word));

    weather = {
      city: data.location.name,
      temp: current.temp_c,
      condition: translateCondition(current.condition.text),
      isRaining: isRaining
    };

  };
  

const label = dateStr ? `Pada ${dateStr}` : 'Saat ini';
const detailLink = `<br><a href="#" onclick="showWeatherDetail('${encodeURIComponent(weather.city)}'); return false;">Lihat detail cuaca di ${weather.city} →</a>`;

if (intent === 'rain') {
  const response = weather.isRaining
    ? `${label} di ${weather.city} sedang atau kemungkinan besar hujan (${weather.condition}).${detailLink}`
    : `${label} di ${weather.city} tidak hujan.${detailLink}`;
  addMessage(response);
} else {
  addMessage(`${label} di ${weather.city}:<br>
    - Suhu: ${weather.temp}°C<br>
    - Kondisi: ${weather.condition}${detailLink}`);
}
}

async function fetchEarthquake() {
  try {
    const res = await fetch('https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json');
    const data = await res.json();

    if (data.Infogempa && data.Infogempa.gempa && data.Infogempa.gempa.length > 0) {
      const last = data.Infogempa.gempa[0];
      const response = `Gempa terbaru:\n- Waktu: ${last.Tanggal} ${last.Jam}\n- Lokasi: ${last.Wilayah}\n- Magnitudo: ${last.Magnitude}\n- Kedalaman: ${last.Kedalaman}`;
      addMessage(response);
    } else {
      addMessage("Tidak ada data gempa terbaru saat ini.");
    }
  } catch (err) {
    console.error(err);
    addMessage("Terjadi kesalahan saat mengambil data gempa.");
  }
}

async function fetchRecentEarthquakes() {
  try {
    const res = await fetch('https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json');
    const data = await res.json();

    if (data.Infogempa && data.Infogempa.gempa && data.Infogempa.gempa.length > 0) {
      let response = 'Berikut beberapa gempa terbaru yang tercatat BMKG:\n';
      data.Infogempa.gempa.slice(0, 3).forEach((g, i) => {
        response += `\n${i + 1}. ${g.Wilayah}\n   - Magnitudo: ${g.Magnitude} SR\n   - Kedalaman: ${g.Kedalaman}\n   - Waktu: ${g.Tanggal} ${g.Jam}\n   - Lokasi: ${g.Lintang}, ${g.Bujur}`;
      });
      addMessage(response);
    } else {
      addMessage('Tidak ada data gempa terkini dari BMKG saat ini.');
    }
  } catch (error) {
    console.error(error);
    addMessage('Gagal mengambil data gempa dari BMKG.');
  }
}

function detectDisasterIntent(text) {
  const keywords = ['gempa', 'bencana', 'guncangan', 'tsunami', 'goyangan'];
  return keywords.some(k => text.toLowerCase().includes(k));
}

function formatWilayah(wilayah) {
  return wilayah
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1 $2')           // jika ada huruf besar di tengah
    .replace(/([a-z])([0-9])/g, '$1 $2')           // jika ada angka di tengah
    .replace(/([a-z])([A-Z])/g, '$1 $2')           // pemisah kata
    .replace(/([A-Z]+)/g, match =>                 // pisahkan huruf besar gabung
      match
        .replace(/([A-Z])(?=[A-Z][a-z])/g, '$1 ')
        .replace(/([a-z])(?=[A-Z])/g, '$1 ')
    )
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function handleEarthquakeQuery() {
  try {
    const res = await fetch('https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json');
    const data = await res.json();
    const gempaList = data.Infogempa.gempa.slice(0, 5); // Ambil 5 gempa terbaru

    if (!gempaList.length) {
      addMessage('Tidak ada data gempa terkini yang tersedia dari BMKG.');
      return;
    }

    let tableHTML = `
      <div class="gempa-scroll">
      <table class="gempa-table">
        <thead>
          <tr>
            <th>Waktu</th>
            <th>Wilayah</th>
            <th>Magnitudo</th>
            <th>Kedalaman</th>
            <th>Lokasi</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const g of gempaList) {
      tableHTML += `
        <tr>
          <td>${g.Tanggal} ${g.Jam}</td>
          <td>${formatWilayah(g.Wilayah)}</td>
          <td>${g.Magnitude}</td>
          <td>${g.Kedalaman}</td>
          <td>${g.Lintang}, ${g.Bujur}</td>
        </tr>
      `;
    }

    tableHTML += '</tbody></table></div>';
    addMessage('Berikut beberapa gempa terbaru berdasarkan data BMKG:<br>' + tableHTML);
  } catch (err) {
    console.error(err);
    addMessage('Gagal mengambil data gempa dari BMKG.');
  }
}

async function handleDisasterQuery(city = null) {
  // Saat ini kita pakai data dari WeatherAPI (karena BMKG tidak menyediakan API bencana lain publik)
  if (!city) {
    return addMessage("Untuk info bencana seperti banjir atau tornado, sebutkan nama kota. Contoh: 'Ada banjir di Surabaya?'");
  }

  try {
    const endpoint = `https://api.weatherapi.com/v1/forecast.json?key=${API_KEY}&q=${city}&days=1&lang=id`;
    const res = await fetch(endpoint);
    const data = await res.json();

    if (data.error) {
      return addMessage(`Maaf, ${data.error.message.toLowerCase()}`);
    }

    const forecast = data.forecast.forecastday[0].day;
    const cond = forecast.condition.text.toLowerCase();
    let bencana = [];

    if (forecast.daily_chance_of_rain > 80 || /heavy rain|thunder/.test(cond)) bencana.push("hujan lebat");
    if (/storm|tornado|gale/.test(cond)) bencana.push("angin kencang atau badai");
    if (forecast.maxwind_kph > 40) bencana.push("angin kencang");

    if (bencana.length) {
      addMessage(`Peringatan potensi bencana di ${city}:\n- ${bencana.join("\n- ")}`);
    } else {
      addMessage(`Tidak ada indikasi bencana besar di ${city} berdasarkan data cuaca terkini.`);
    }
  } catch (err) {
    console.error(err);
    addMessage("Gagal mengambil informasi bencana dari data cuaca.");
  }
}

function useTip(element) {
    const text = element.textContent;
    document.getElementById('user-input').value = text.replace(/"/g, '');
    sendMessage();
}

async function sendMessage() {
  const userMsg = userInput.value.trim();
  if (!userMsg) return;

  // Show loading state
  const button = document.querySelector('.input-container button');
  const loading = button.querySelector('.loading');
  const buttonText = button.querySelector('.button-text');
  
  loading.style.display = 'inline-block';
  buttonText.style.opacity = '0.5';
  button.disabled = true;
  userInput.disabled = true;

  addMessage(userMsg, true);
  userInput.value = '';

  try {
    const intent = detectIntent(userMsg);
    const city = extractCity(userMsg);
    const dateStr = extractDateFromText(userMsg);

    if (dateStr === 'future-limit-exceeded') {
      addMessage('Maaf, saya hanya bisa memberikan prediksi cuaca hingga 2 hari ke depan.');
    } else if (intent === 'earthquake') {
      await handleEarthquakeQuery();
    } else if (intent === 'disaster') {
      await handleDisasterQuery(city);
    } else if (!city) {
      addMessage('Mohon sebutkan nama kota. Contoh: "Cuaca di Jakarta besok" atau "Jakarta 2 hari lalu hujan?"');
    } else {
      await fetchWeather(city, dateStr, intent);
    }
  } catch (error) {
    console.error(error);
    addMessage('Maaf, terjadi kesalahan. Silakan coba lagi.');
  } finally {
    // Reset loading state
    loading.style.display = 'none';
    buttonText.style.opacity = '1';
    button.disabled = false;
    userInput.disabled = false;
    userInput.focus();
  }
}

async function showWeatherDetail(city) {
    try {
        const res = await fetch(`https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${city}&lang=id`);
        const data = await res.json();
        
        if (data.error) {
            alert('Gagal mengambil data cuaca');
            return;
        }

        const w = data.current;
        const content = `
            <p><strong>Kota:</strong> <span>${data.location.name}</span></p>
            <p><strong>Suhu:</strong> <span>${w.temp_c}°C</span></p>
            <p><strong>Kondisi:</strong> <span>${translateCondition(w.condition.text)}</span></p>
            <p><strong>Kelembapan:</strong> <span>${w.humidity}%</span></p>
            <p><strong>Angin:</strong> <span>${w.wind_kph} km/j</span></p>
            <div style="text-align: center; margin-top: 15px;">
                <img src="https:${w.condition.icon}" alt="weather icon" style="width: 64px;">
            </div>
        `;

        document.getElementById('modal-title').textContent = `Cuaca di ${data.location.name}`;
        document.getElementById('modal-content').innerHTML = content;
        document.getElementById('weatherModal').style.display = 'block';
    } catch (err) {
        console.error(err);
        alert('Gagal mengambil data cuaca');
    }
}

// Add modal close functionality
document.querySelector('.close-modal').onclick = function() {
    document.getElementById('weatherModal').style.display = 'none';
}

window.onclick = function(event) {
    const modal = document.getElementById('weatherModal');
    if (event.target == modal) {
        modal.style.display = 'none';
    }
}
