export interface EventWeather {
  condition:string;
  temperature_f:number;
  feels_like_f:number;
  precipitation_probability:number;
  suggestion:string;
  source:'Open-Meteo';
}

interface WeatherHour {
  time:string;
  temperature_f:number;
  feels_like_f:number;
  precipitation_probability:number;
  weather_code:number;
}

const STAMFORD_LAT=41.0534;
const STAMFORD_LON=-73.5387;

const localParts=(value:Date) => Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'
}).formatToParts(value).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));

export function isTodayInStamford(startsAt:string|null,now=new Date()) {
  if(!startsAt) return false;
  const start=new Date(startsAt);
  if(Number.isNaN(start.valueOf())) return false;
  const a=localParts(start),b=localParts(now);
  return a.year===b.year&&a.month===b.month&&a.day===b.day;
}

const hourKey=(value:string) => {
  const parts=localParts(new Date(value));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:00`;
};

const condition=(code:number) => {
  if(code===0) return 'clear';
  if(code<=3) return 'partly cloudy';
  if(code===45||code===48) return 'foggy';
  if(code>=51&&code<=67) return 'rainy';
  if(code>=71&&code<=77) return 'snowy';
  if(code>=80&&code<=82) return 'showery';
  if(code>=85&&code<=86) return 'snowy';
  if(code>=95) return 'stormy';
  return 'mixed';
};

const suggestion=(rain:number,code:number,temp:number) => {
  if(code>=95) return 'Check conditions before leaving and favor an indoor backup if storms develop.';
  if(rain>=60||code>=51&&code<=82) return 'Bring rain gear and keep an indoor backup handy.';
  if(temp>=88) return 'Bring water and take shade breaks.';
  if(temp<=40) return 'Layer up before heading out.';
  return 'Conditions look reasonable, but check once more before leaving.';
};

export async function fetchStamfordEventWeather(startsAt:string,fetcher:typeof fetch=fetch):Promise<EventWeather|undefined> {
  if(!isTodayInStamford(startsAt)) return;
  const params=new URLSearchParams({
    latitude:String(STAMFORD_LAT),longitude:String(STAMFORD_LON),
    hourly:'temperature_2m,apparent_temperature,precipitation_probability,weather_code',
    temperature_unit:'fahrenheit',timezone:'America/New_York',forecast_days:'1'
  });
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),2000);
  try {
    const response=await fetcher(`https://api.open-meteo.com/v1/forecast?${params}`,{signal:controller.signal});
    if(!response.ok) return;
    const body=await response.json() as any;
    const times=Array.isArray(body?.hourly?.time)?body.hourly.time:[];
    const hours:WeatherHour[]=times.map((time:string,index:number)=>({
      time,
      temperature_f:Number(body.hourly.temperature_2m?.[index]),
      feels_like_f:Number(body.hourly.apparent_temperature?.[index]),
      precipitation_probability:Number(body.hourly.precipitation_probability?.[index]),
      weather_code:Number(body.hourly.weather_code?.[index])
    })).filter((x:WeatherHour)=>Number.isFinite(x.temperature_f)&&Number.isFinite(x.feels_like_f)&&Number.isFinite(x.precipitation_probability)&&Number.isFinite(x.weather_code));
    const wanted=hourKey(startsAt);
    const weather=hours.find(x=>x.time===wanted)||hours[0];
    if(!weather) return;
    return {
      condition:condition(weather.weather_code),
      temperature_f:Math.round(weather.temperature_f),
      feels_like_f:Math.round(weather.feels_like_f),
      precipitation_probability:Math.round(weather.precipitation_probability),
      suggestion:suggestion(weather.precipitation_probability,weather.weather_code,weather.temperature_f),
      source:'Open-Meteo'
    };
  } catch { return; }
  finally { clearTimeout(timer); }
}
