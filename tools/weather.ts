import type { Tool, ToolContext, ToolResult } from '../src/types.js'

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY

// Mapping kode cuaca OpenWeatherMap ke emoji
const WEATHER_EMOJI: Record<string, string> = {
  'Clear': '☀️',
  'Clouds': '☁️',
  'Rain': '🌧️',
  'Drizzle': '🌦️',
  'Thunderstorm': '⛈️',
  'Snow': '❄️',
  'Mist': '🌫️',
  'Fog': '🌫️',
  'Haze': '🌫️',
  'Smoke': '💨',
  'Dust': '💨',
  'Sand': '💨',
  'Tornado': '🌪️'
}

function windDirection(deg: number): string {
  const dirs = ['Utara', 'Timur Laut', 'Timur', 'Tenggara', 'Selatan', 'Barat Daya', 'Barat', 'Barat Laut']
  return dirs[Math.round(deg / 45) % 8]
}

export const weatherTool: Tool = {
  schema: {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Cek cuaca terkini di suatu kota. Gunakan saat user bertanya tentang cuaca, suhu, atau kondisi alam di lokasi tertentu.',
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: 'Nama kota (contoh: Jakarta, Surabaya, Tokyo, New York)'
          },
          country_code: {
            type: 'string',
            description: 'Kode negara ISO 3166 opsional (contoh: ID, US, JP). Default: tidak ada'
          }
        },
        required: ['city']
      }
    }
  },

  async execute({ city, country_code }, context: ToolContext): Promise<ToolResult> {
    if (!city || typeof city !== 'string') {
      return { success: false, error: 'Nama kota harus diisi' }
    }

    // Gunakan OpenWeatherMap API jika ada key, fallback ke wttr.in
    if (OPENWEATHER_API_KEY && OPENWEATHER_API_KEY !== 'xxxxxxxxxxxxxxxxxxxx') {
      return await openWeatherFetch(city as string, country_code as string | undefined)
    }
    return await wttrFallback(city as string)
  }
}

async function openWeatherFetch(city: string, countryCode?: string): Promise<ToolResult> {
  const query = countryCode ? `${city},${countryCode}` : city

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(query)}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=id`
    )

    if (!res.ok) {
      if (res.status === 404) return { success: false, error: `Kota "${city}" tidak ditemukan` }
      throw new Error(`HTTP ${res.status}`)
    }

    const data = await res.json() as any
    const weather = data.weather?.[0]
    const main = data.main
    const wind = data.wind

    return {
      success: true,
      city: data.name,
      country: data.sys?.country,
      emoji: WEATHER_EMOJI[weather?.main] ?? '🌡️',
      condition: weather?.description ?? 'N/A',
      temperature: {
        current: Math.round(main.temp),
        feels_like: Math.round(main.feels_like),
        min: Math.round(main.temp_min),
        max: Math.round(main.temp_max),
        unit: '°C'
      },
      humidity: main.humidity,
      wind: {
        speed: wind?.speed ? `${(wind.speed * 3.6).toFixed(1)} km/h` : 'N/A',
        direction: wind?.deg ? windDirection(wind.deg) : 'N/A'
      },
      visibility: data.visibility ? `${(data.visibility / 1000).toFixed(1)} km` : 'N/A',
      clouds: `${data.clouds?.all ?? 0}%`
    }
  } catch (err: any) {
    return { success: false, error: `Gagal mengambil data cuaca: ${err.message}` }
  }
}

async function wttrFallback(city: string): Promise<ToolResult> {
  try {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
      headers: { 'User-Agent': 'WA-AI-Agent/1.0' }
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as any

    const current = data.current_condition?.[0]
    if (!current) throw new Error('Data cuaca tidak tersedia')

    const area = data.nearest_area?.[0]

    return {
      success: true,
      city: area?.areaName?.[0]?.value ?? city,
      country: area?.country?.[0]?.value ?? 'Unknown',
      emoji: '🌡️',
      condition: current.weatherDesc?.[0]?.value ?? 'N/A',
      temperature: {
        current: parseInt(current.temp_C),
        feels_like: parseInt(current.FeelsLikeC),
        unit: '°C'
      },
      humidity: `${current.humidity}%`,
      wind: {
        speed: `${current.windspeedKmph} km/h`,
        direction: current.winddir16Point ?? 'N/A'
      },
      visibility: `${current.visibility} km`,
      clouds: `${current.cloudcover}%`
    }
  } catch (err: any) {
    return { success: false, error: `Gagal mengambil data cuaca: ${err.message}` }
  }
}
