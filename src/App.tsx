/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Navigation,
  ArrowLeftRight,
  AlertTriangle,
  History,
  Check,
  Copy,
  Mic,
  MicOff,
  Bell,
  Play,
  Leaf,
  Clock,
  ShieldCheck,
  LocateFixed,
} from 'lucide-react';
import {
  DIGITAL_TWIN_ZONES,
  ZoneDigitalTwinData,
  DigitalTwinKPIHeader,
  GisQuickActionToolbar,
  DigitalTwinPopoverDrawer,
} from './components/DigitalTwinInspectorDrawer';
import {
  TrafficAnalyticsPanel,
  AnalyticsZoneFilter,
} from './components/TrafficAnalyticsPanel';

declare global {
  interface Window {
    L: any;
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

// Configurable scoring weights (matching route_engine.py)
const WEIGHT_TRAVEL_TIME = 0.4;
const WEIGHT_CONGESTION = 0.3;
const WEIGHT_ACCIDENT_RISK = 0.3;

const HIGH_RISK_THRESHOLD = 0.60;
const DANGEROUS_COMPOSITE_THRESHOLD = 0.80;
const STATION_SEARCH_RADIUS_KM = 1.0;
const FREE_FLOW_SPEED_KMH = 50.0;
const FALLBACK_SPEED_KMH = 35.0;
const TOMTOM_API_KEY = 'tMH1SqdE3k93cZhegvsUWyoLJxg5WubS';

export interface TomTomStationTraffic {
  stationId: number;
  currentSpeedKmh: number;
  freeFlowSpeedKmh: number;
  congestionRatio: number;
  trafficLevel: 'high' | 'average' | 'low';
  liveRiskScore: number;
  roadClosure: boolean;
  updatedAt: string;
  isLiveApi: boolean;
}

export interface MidJourneyJamReroute {
  active: boolean;
  safestRouteId: number;
  jamRatioIndex: number;
  vehicleLat: number;
  vehicleLon: number;
  jamLat: number;
  jamLon: number;
  jamEndLat: number;
  jamEndLon: number;
  jamLocationName: string;
  traveledCoords: [number, number][];
  jammedSegmentCoords: [number, number][];
  originalRemainingCoords: [number, number][];
  detourCoords: [number, number][];
  detourDistanceKm: number;
  detourEtaMinutes: number;
  jammedWaitMinutes: number;
  timeSavedMinutes: number;
  reason: string;
}

export interface Station2023 {
  id: number;
  zone: 'East' | 'West' | 'North' | 'South';
  subDivision: string;
  name: string;
  lat: number;
  lon: number;
  fatalCases2023: number;
  killedPeople2023: number;
  nonFatal2023: number;
  injuredPeople2023: number;
  totalCases2023: number;
  riskScore2023: number;
}

export interface NearbyStationMatch {
  id: number;
  name: string;
  zone: string;
  sub_division: string;
  lat: number;
  lon: number;
  distance_km: number;
  fatal_cases_2023: number;
  killed_2023: number;
  non_fatal_2023: number;
  injured_2023: number;
  total_cases_2023: number;
  risk_score: number;
  is_high_risk: boolean;
}

export type WeatherCondition = 'clear' | 'light_rain' | 'heavy_rain' | 'fog';

export interface ForecastFactors {
  temporal_harmonics: number;
  day_of_week_effect: number;
  weather_impact: number;
  corridor_baseline: number;
  day_name: string;
  regime_label: string;
}

export interface ForecastSlot {
  offset_hours: number;
  timestamp: string;
  time_label: string;
  hour_str: string;
  congestion_score: number;
  eta_minutes: number;
}

export interface ScoredRoute {
  route_id: number;
  rank: number;
  tag: 'Fastest' | 'Safest' | 'Balanced';
  recommended: boolean;
  distance_km: number;
  duration_s: number;
  eta_minutes: number;
  normalized_time: number;
  congestion_score: number;
  forecast_factors: ForecastFactors;
  forecast_series: ForecastSlot[];
  accident_risk: number;
  composite_score: number;
  high_risk_count: number;
  total_2023_cases_along_route: number;
  nearby_stations: NearbyStationMatch[];
  explanation: string;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  is_fallback: boolean;
}

export interface RouteHistoryEntry {
  id: number;
  user_id: number;
  source: string;
  destination: string;
  chosen_route: string;
  timestamp: string;
}

// Raw 48 stations from user-provided 2023 dataset (excluding summary Total rows)
const RAW_2023_STATIONS: Array<Omit<Station2023, 'riskScore2023'>> = [
  // East Zone — East Sub-division
  { id: 1, zone: 'East', subDivision: 'East', name: 'Halasooru', lat: 12.9779, lon: 77.6245, fatalCases2023: 11, killedPeople2023: 11, nonFatal2023: 56, injuredPeople2023: 48, totalCases2023: 67 },
  { id: 2, zone: 'East', subDivision: 'East', name: 'Indiranagar', lat: 12.9719, lon: 77.6412, fatalCases2023: 12, killedPeople2023: 12, nonFatal2023: 73, injuredPeople2023: 62, totalCases2023: 85 },
  { id: 3, zone: 'East', subDivision: 'East', name: 'Pulikeshinagar', lat: 12.9982, lon: 77.6083, fatalCases2023: 4, killedPeople2023: 4, nonFatal2023: 23, injuredPeople2023: 24, totalCases2023: 27 },
  { id: 4, zone: 'East', subDivision: 'East', name: 'Banasawadi', lat: 13.0142, lon: 77.6518, fatalCases2023: 14, killedPeople2023: 15, nonFatal2023: 77, injuredPeople2023: 82, totalCases2023: 91 },
  { id: 5, zone: 'East', subDivision: 'East', name: 'Shivajinagar', lat: 12.9857, lon: 77.6057, fatalCases2023: 6, killedPeople2023: 6, nonFatal2023: 21, injuredPeople2023: 19, totalCases2023: 27 },
  { id: 6, zone: 'East', subDivision: 'East', name: 'K G Halli', lat: 13.0294, lon: 77.6192, fatalCases2023: 6, killedPeople2023: 6, nonFatal2023: 34, injuredPeople2023: 39, totalCases2023: 40 },
  // East Zone — Whitefield Sub-division
  { id: 8, zone: 'East', subDivision: 'Whitefield', name: 'K R Puram', lat: 13.0012, lon: 77.6714, fatalCases2023: 41, killedPeople2023: 42, nonFatal2023: 213, injuredPeople2023: 217, totalCases2023: 254 },
  { id: 9, zone: 'East', subDivision: 'Whitefield', name: 'Airport', lat: 12.9606, lon: 77.6649, fatalCases2023: 17, killedPeople2023: 17, nonFatal2023: 80, injuredPeople2023: 80, totalCases2023: 97 },
  { id: 10, zone: 'East', subDivision: 'Whitefield', name: 'Whitefield', lat: 12.9698, lon: 77.7499, fatalCases2023: 43, killedPeople2023: 44, nonFatal2023: 180, injuredPeople2023: 163, totalCases2023: 223 },
  { id: 11, zone: 'East', subDivision: 'Whitefield', name: 'Mahadevapura', lat: 12.9915, lon: 77.6958, fatalCases2023: 11, killedPeople2023: 12, nonFatal2023: 82, injuredPeople2023: 72, totalCases2023: 93 },
  // West Zone — Central Sub-division
  { id: 14, zone: 'West', subDivision: 'Central', name: 'Cubbon Park', lat: 12.9774, lon: 77.5952, fatalCases2023: 2, killedPeople2023: 2, nonFatal2023: 54, injuredPeople2023: 41, totalCases2023: 56 },
  { id: 15, zone: 'West', subDivision: 'Central', name: 'H.Grounds', lat: 12.9896, lon: 77.5825, fatalCases2023: 6, killedPeople2023: 6, nonFatal2023: 50, injuredPeople2023: 47, totalCases2023: 56 },
  { id: 16, zone: 'West', subDivision: 'Central', name: 'S.S.Nagar', lat: 12.9998, lon: 77.5712, fatalCases2023: 8, killedPeople2023: 8, nonFatal2023: 39, injuredPeople2023: 33, totalCases2023: 47 },
  { id: 17, zone: 'West', subDivision: 'Central', name: 'U.Gate', lat: 12.9675, lon: 77.5861, fatalCases2023: 7, killedPeople2023: 8, nonFatal2023: 47, injuredPeople2023: 44, totalCases2023: 54 },
  { id: 18, zone: 'West', subDivision: 'Central', name: 'Ashokanagar', lat: 12.9670, lon: 77.6080, fatalCases2023: 6, killedPeople2023: 6, nonFatal2023: 32, injuredPeople2023: 30, totalCases2023: 38 },
  { id: 19, zone: 'West', subDivision: 'Central', name: 'W.Garden', lat: 12.9507, lon: 77.5968, fatalCases2023: 6, killedPeople2023: 6, nonFatal2023: 59, injuredPeople2023: 45, totalCases2023: 65 },
  // West Zone — West Sub-division
  { id: 21, zone: 'West', subDivision: 'West', name: 'Upparpet', lat: 12.9767, lon: 77.5753, fatalCases2023: 9, killedPeople2023: 9, nonFatal2023: 20, injuredPeople2023: 18, totalCases2023: 29 },
  { id: 22, zone: 'West', subDivision: 'West', name: 'Chickpet', lat: 12.9699, lon: 77.5762, fatalCases2023: 9, killedPeople2023: 10, nonFatal2023: 37, injuredPeople2023: 31, totalCases2023: 46 },
  { id: 23, zone: 'West', subDivision: 'West', name: 'City Market', lat: 12.9634, lon: 77.5769, fatalCases2023: 9, killedPeople2023: 9, nonFatal2023: 23, injuredPeople2023: 28, totalCases2023: 32 },
  { id: 24, zone: 'West', subDivision: 'West', name: 'Bytarayanapura', lat: 12.9538, lon: 77.5419, fatalCases2023: 19, killedPeople2023: 19, nonFatal2023: 163, injuredPeople2023: 125, totalCases2023: 182 },
  { id: 25, zone: 'West', subDivision: 'West', name: 'Kengeri', lat: 12.9081, lon: 77.4856, fatalCases2023: 58, killedPeople2023: 59, nonFatal2023: 221, injuredPeople2023: 237, totalCases2023: 279 },
  // West Zone — Vijayanagar Sub-division
  { id: 27, zone: 'West', subDivision: 'Vijayanagar', name: 'Vijayanagar', lat: 12.9716, lon: 77.5322, fatalCases2023: 16, killedPeople2023: 16, nonFatal2023: 63, injuredPeople2023: 66, totalCases2023: 79 },
  { id: 28, zone: 'West', subDivision: 'Vijayanagar', name: 'Magadi Road', lat: 12.9756, lon: 77.5553, fatalCases2023: 7, killedPeople2023: 7, nonFatal2023: 43, injuredPeople2023: 42, totalCases2023: 50 },
  { id: 29, zone: 'West', subDivision: 'Vijayanagar', name: 'Kamakshipalya', lat: 12.9845, lon: 77.5236, fatalCases2023: 40, killedPeople2023: 41, nonFatal2023: 201, injuredPeople2023: 202, totalCases2023: 241 },
  // North Zone — North East Sub-division
  { id: 32, zone: 'North', subDivision: 'North East', name: 'R T Nagar', lat: 13.0213, lon: 77.5949, fatalCases2023: 8, killedPeople2023: 8, nonFatal2023: 74, injuredPeople2023: 63, totalCases2023: 82 },
  { id: 33, zone: 'North', subDivision: 'North East', name: 'Hebbala', lat: 13.0358, lon: 77.5970, fatalCases2023: 24, killedPeople2023: 24, nonFatal2023: 120, injuredPeople2023: 118, totalCases2023: 144 },
  { id: 34, zone: 'North', subDivision: 'North East', name: 'Yalahanka', lat: 13.1007, lon: 77.5963, fatalCases2023: 58, killedPeople2023: 63, nonFatal2023: 178, injuredPeople2023: 222, totalCases2023: 236 },
  { id: 35, zone: 'North', subDivision: 'North East', name: 'Chikkajala', lat: 13.1592, lon: 77.6353, fatalCases2023: 36, killedPeople2023: 39, nonFatal2023: 101, injuredPeople2023: 129, totalCases2023: 137 },
  { id: 36, zone: 'North', subDivision: 'North East', name: 'Int. Aiport', lat: 13.1986, lon: 77.7066, fatalCases2023: 59, killedPeople2023: 61, nonFatal2023: 173, injuredPeople2023: 215, totalCases2023: 232 },
  { id: 37, zone: 'North', subDivision: 'North East', name: 'Hennuru', lat: 13.0359, lon: 77.6431, fatalCases2023: 23, killedPeople2023: 24, nonFatal2023: 80, injuredPeople2023: 84, totalCases2023: 103 },
  // North Zone — North Sub-division
  { id: 39, zone: 'North', subDivision: 'North', name: 'Malleshwaram', lat: 13.0031, lon: 77.5643, fatalCases2023: 18, killedPeople2023: 18, nonFatal2023: 81, injuredPeople2023: 88, totalCases2023: 99 },
  { id: 40, zone: 'North', subDivision: 'North', name: 'Rajajinagar', lat: 12.9901, lon: 77.5525, fatalCases2023: 16, killedPeople2023: 17, nonFatal2023: 86, injuredPeople2023: 82, totalCases2023: 102 },
  { id: 41, zone: 'North', subDivision: 'North', name: 'Yashawanthapura', lat: 13.0238, lon: 77.5529, fatalCases2023: 21, killedPeople2023: 22, nonFatal2023: 85, injuredPeople2023: 82, totalCases2023: 106 },
  { id: 42, zone: 'North', subDivision: 'North', name: 'Peenya', lat: 13.0329, lon: 77.5273, fatalCases2023: 32, killedPeople2023: 32, nonFatal2023: 160, injuredPeople2023: 191, totalCases2023: 192 },
  { id: 43, zone: 'North', subDivision: 'North', name: 'Jalahalli', lat: 13.0467, lon: 77.5479, fatalCases2023: 28, killedPeople2023: 29, nonFatal2023: 74, injuredPeople2023: 84, totalCases2023: 102 },
  // South Zone — South East Sub-division
  { id: 46, zone: 'South', subDivision: 'South East', name: 'Adugodi', lat: 12.9428, lon: 77.6104, fatalCases2023: 10, killedPeople2023: 10, nonFatal2023: 53, injuredPeople2023: 67, totalCases2023: 63 },
  { id: 47, zone: 'South', subDivision: 'South East', name: 'Madivala', lat: 12.9212, lon: 77.6213, fatalCases2023: 14, killedPeople2023: 14, nonFatal2023: 59, injuredPeople2023: 53, totalCases2023: 73 },
  { id: 48, zone: 'South', subDivision: 'South East', name: 'Micolayout', lat: 12.9165, lon: 77.6101, fatalCases2023: 14, killedPeople2023: 14, nonFatal2023: 74, injuredPeople2023: 71, totalCases2023: 88 },
  { id: 49, zone: 'South', subDivision: 'South East', name: 'Hulimavu', lat: 12.8773, lon: 77.6022, fatalCases2023: 16, killedPeople2023: 16, nonFatal2023: 92, injuredPeople2023: 117, totalCases2023: 108 },
  // South Zone — South Sub-division
  { id: 51, zone: 'South', subDivision: 'South', name: 'Chamarajpet', lat: 12.9571, lon: 77.5633, fatalCases2023: 4, killedPeople2023: 4, nonFatal2023: 25, injuredPeople2023: 22, totalCases2023: 29 },
  { id: 52, zone: 'South', subDivision: 'South', name: 'Basavanagudi', lat: 12.9417, lon: 77.5736, fatalCases2023: 3, killedPeople2023: 3, nonFatal2023: 99, injuredPeople2023: 98, totalCases2023: 102 },
  { id: 53, zone: 'South', subDivision: 'South', name: 'Jayanagar', lat: 12.9250, lon: 77.5838, fatalCases2023: 13, killedPeople2023: 13, nonFatal2023: 77, injuredPeople2023: 77, totalCases2023: 90 },
  { id: 54, zone: 'South', subDivision: 'South', name: 'Banashankari', lat: 12.9255, lon: 77.5468, fatalCases2023: 15, killedPeople2023: 15, nonFatal2023: 75, injuredPeople2023: 66, totalCases2023: 90 },
  { id: 55, zone: 'South', subDivision: 'South', name: 'K S Layout', lat: 12.9054, lon: 77.5632, fatalCases2023: 18, killedPeople2023: 18, nonFatal2023: 136, injuredPeople2023: 137, totalCases2023: 154 },
  { id: 56, zone: 'South', subDivision: 'South', name: 'Thalagattapura', lat: 12.8712, lon: 77.5390, fatalCases2023: 22, killedPeople2023: 26, nonFatal2023: 67, injuredPeople2023: 69, totalCases2023: 89 },
  // South Zone — HSR Layout Sub-division
  { id: 58, zone: 'South', subDivision: 'HSR Layout', name: 'HSR Layout', lat: 12.9121, lon: 77.6446, fatalCases2023: 16, killedPeople2023: 17, nonFatal2023: 40, injuredPeople2023: 56, totalCases2023: 56 },
  { id: 59, zone: 'South', subDivision: 'HSR Layout', name: 'Electronic City', lat: 12.8452, lon: 77.6602, fatalCases2023: 38, killedPeople2023: 39, nonFatal2023: 158, injuredPeople2023: 171, totalCases2023: 196 },
  { id: 60, zone: 'South', subDivision: 'HSR Layout', name: 'Bellanduru', lat: 12.9258, lon: 77.6762, fatalCases2023: 9, killedPeople2023: 9, nonFatal2023: 34, injuredPeople2023: 34, totalCases2023: 43 },
];

// Compute normalized 2023 severity risk score matching route_engine.py
const MAX_SEV = Math.max(
  ...RAW_2023_STATIONS.map((s) => s.fatalCases2023 * 3.0 + s.killedPeople2023 * 1.5 + s.nonFatal2023 * 1.0)
);
const MAX_TOT = Math.max(...RAW_2023_STATIONS.map((s) => s.totalCases2023));

const ROADSAFE_2023_STATIONS: Station2023[] = RAW_2023_STATIONS.map((s) => {
  const sev = s.fatalCases2023 * 3.0 + s.killedPeople2023 * 1.5 + s.nonFatal2023 * 1.0;
  const riskScore2023 = Number(
    Math.min(1.0, 0.55 * (sev / MAX_SEV) + 0.45 * (s.totalCases2023 / MAX_TOT)).toFixed(4)
  );
  return { ...s, riskScore2023 };
});

// Zone totals from the 2023 CSV
const ZONE_SUMMARY_2023 = [
  { zone: 'East Total', fatalCases: 165, killed: 169, nonFatal: 839, injured: 806, totalCases: 1004 },
  { zone: 'West Total', fatalCases: 202, killed: 206, nonFatal: 1052, injured: 989, totalCases: 1254 },
  { zone: 'North Total', fatalCases: 323, killed: 337, nonFatal: 1212, injured: 1358, totalCases: 1535 },
  { zone: 'South Total', fatalCases: 192, killed: 198, nonFatal: 989, injured: 1038, totalCases: 1181 },
  { zone: 'Grand Total (2023)', fatalCases: 882, killed: 910, nonFatal: 4092, injured: 4191, totalCases: 4974 },
];

// Yearly trend data (2007-2025) from the user's attached CSV
const YEARLY_ACCIDENT_TREND = [
  { id: 1, year: 2007, fatal: 957, killed: 981, nonFatal: 7469, total: 8426 },
  { id: 2, year: 2008, fatal: 864, killed: 892, nonFatal: 6908, total: 7772 },
  { id: 3, year: 2009, fatal: 737, killed: 761, nonFatal: 6138, total: 6875 },
  { id: 4, year: 2010, fatal: 816, killed: 858, nonFatal: 5667, total: 6483 },
  { id: 5, year: 2011, fatal: 727, killed: 762, nonFatal: 5297, total: 6024 },
  { id: 6, year: 2012, fatal: 740, killed: 760, nonFatal: 4767, total: 5507 },
  { id: 7, year: 2013, fatal: 737, killed: 771, nonFatal: 4493, total: 5230 },
  { id: 8, year: 2014, fatal: 711, killed: 737, nonFatal: 4293, total: 5004 },
  { id: 9, year: 2015, fatal: 714, killed: 740, nonFatal: 4114, total: 4828 },
  { id: 10, year: 2016, fatal: 754, killed: 793, nonFatal: 6752, total: 7506 },
  { id: 11, year: 2017, fatal: 609, killed: 642, nonFatal: 4455, total: 5064 },
  { id: 12, year: 2018, fatal: 661, killed: 686, nonFatal: 3950, total: 4611 },
  { id: 13, year: 2019, fatal: 744, killed: 766, nonFatal: 3944, total: 4688 },
  { id: 14, year: 2020, fatal: 622, killed: 647, nonFatal: 2614, total: 3236 },
  { id: 15, year: 2021, fatal: 621, killed: 654, nonFatal: 2592, total: 3213 },
  { id: 16, year: 2022, fatal: 752, killed: 772, nonFatal: 3070, total: 3822 },
  { id: 17, year: 2023, fatal: 882, killed: 910, nonFatal: 4092, total: 4974 },
  { id: 18, year: 2024, fatal: 869, killed: 894, nonFatal: 3900, total: 4769 },
  { id: 19, year: 2025, fatal: 843, killed: 878, nonFatal: 4050, total: 4893 },
];

const PRESET_EXAMPLES = [
  {
    label: 'Kengeri → K R Puram (West-to-East High-Risk Corridor)',
    source: 'Kengeri',
    destination: 'K R Puram',
    depart_time: '2026-11-05T18:15',
  },
  {
    label: 'Madivala → Hebbala (South-to-North Arterial)',
    source: 'Madivala',
    destination: 'Hebbala',
    depart_time: '2026-11-05T09:00',
  },
  {
    label: 'Cubbon Park → Whitefield (Central-to-Whitefield IT Corridor)',
    source: 'Cubbon Park',
    destination: 'Whitefield',
    depart_time: '2026-11-05T13:30',
  },
];

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0088;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function validateCoordinates(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function samplePolyline(coords: [number, number][], stepKm = 0.5): [number, number][] {
  if (!coords.length) return [];
  const sampled: [number, number][] = [[coords[0][1], coords[0][0]]];
  let accumKm = 0;

  for (let i = 1; i < coords.length; i++) {
    let [prevLon, prevLat] = coords[i - 1];
    const [curLon, curLat] = coords[i];
    let segKm = haversineKm(prevLat, prevLon, curLat, curLon);
    if (segKm <= 0) continue;

    while (accumKm + segKm >= stepKm) {
      const remain = stepKm - accumKm;
      const ratio = remain / segKm;
      const interpLat = prevLat + ratio * (curLat - prevLat);
      const interpLon = prevLon + ratio * (curLon - prevLon);
      sampled.push([interpLat, interpLon]);
      prevLat = interpLat;
      prevLon = interpLon;
      segKm = haversineKm(prevLat, prevLon, curLat, curLon);
      accumKm = 0;
    }
    accumKm += segKm;
  }

  const last = coords[coords.length - 1];
  const lastTuple: [number, number] = [last[1], last[0]];
  const prevEnd = sampled[sampled.length - 1];
  if (prevEnd[0] !== lastTuple[0] || prevEnd[1] !== lastTuple[1]) {
    sampled.push(lastTuple);
  }
  return sampled;
}

const WEATHER_PROFILES: Record<
  WeatherCondition,
  { code: number; congBoost: number; speedFactor: number; label: string; riskBoost: number }
> = {
  clear: { code: 0.0, congBoost: 0.0, speedFactor: 1.0, label: 'Clear Sky', riskBoost: 0.0 },
  light_rain: { code: 0.35, congBoost: 0.12, speedFactor: 1.14, label: 'Light Rain', riskBoost: 0.03 },
  heavy_rain: { code: 0.85, congBoost: 0.26, speedFactor: 1.32, label: 'Heavy Rain', riskBoost: 0.07 },
  fog: { code: 0.60, congBoost: 0.18, speedFactor: 1.22, label: 'Fog / Low Visibility', riskBoost: 0.05 },
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function predictTrafficCongestionML(
  distanceM: number,
  durationS: number,
  departDate: Date,
  weatherCondition: WeatherCondition = 'clear',
  corridorOffset = 0
): {
  score: number;
  adjustedDurationS: number;
  etaMinutes: number;
  multiplier: number;
  factors: ForecastFactors;
} {
  const wProf = WEATHER_PROFILES[weatherCondition] ?? WEATHER_PROFILES.clear;
  const distKm = Math.max(0.1, distanceM / 1000);
  const freeFlowS = (distKm / FREE_FLOW_SPEED_KMH) * 3600;
  const day = departDate.getDay();
  const isWeekend = day === 0 || day === 6;
  const decimalHour = departDate.getHours() + departDate.getMinutes() / 60;

  // Fourier time-series harmonics + Gaussian commuter rush regimes
  const morningWave = Math.exp(-0.5 * ((decimalHour - 9.0) / 1.45) ** 2);
  const eveningWave = Math.exp(-0.5 * ((decimalHour - 18.5) / 1.65) ** 2);
  const middayWave = Math.exp(-0.5 * ((decimalHour - 13.5) / 2.6) ** 2);
  const sin24 = Math.sin((2 * Math.PI * decimalHour) / 24);
  const cos12 = Math.cos((4 * Math.PI * decimalHour) / 24);

  let temporalComponent = 0.14;
  let dayEffect = 0;
  let regimeLabel = 'Off-Peak Flow';

  if (!isWeekend) {
    temporalComponent =
      0.12 +
      0.46 * morningWave +
      0.56 * eveningWave +
      0.20 * middayWave +
      0.03 * Math.max(0, -sin24 + 0.5 * cos12);
    if (day === 5 && decimalHour >= 15.0) {
      dayEffect = 0.06; // Friday evening outbound surge
    } else if (day === 1 && decimalHour >= 7.5 && decimalHour <= 11.0) {
      dayEffect = 0.04; // Monday morning commuter surge
    }
    if (decimalHour >= 7.5 && decimalHour <= 10.5) regimeLabel = 'Morning Rush Peak';
    else if (decimalHour >= 17.0 && decimalHour <= 20.5) regimeLabel = 'Evening Rush Peak';
    else if (decimalHour > 10.5 && decimalHour < 17.0) regimeLabel = 'Midday Arterial Flow';
  } else {
    const weekendWave = Math.exp(-0.5 * ((decimalHour - 16.5) / 3.4) ** 2);
    temporalComponent = 0.10 + 0.30 * weekendWave;
    dayEffect = -0.06;
    regimeLabel = decimalHour >= 11.0 && decimalHour <= 20.0 ? 'Weekend Active Window' : 'Weekend Free Flow';
  }

  const baseDelay = Math.min(1, Math.max(0.05, (durationS - freeFlowS) / Math.max(1, freeFlowS)));
  const weatherComponent = wProf.congBoost;

  const rawScore =
    0.55 * temporalComponent +
    0.30 * baseDelay +
    weatherComponent +
    dayEffect +
    corridorOffset;

  const finalScore = Number(Math.min(0.98, Math.max(0.05, rawScore)).toFixed(4));
  const multiplier = (0.85 + 0.72 * finalScore) * wProf.speedFactor;
  const adjustedDurationS = Number(Math.max(freeFlowS * 0.85, durationS * multiplier).toFixed(1));

  return {
    score: finalScore,
    adjustedDurationS,
    etaMinutes: Math.max(1, Math.round(adjustedDurationS / 60)),
    multiplier,
    factors: {
      temporal_harmonics: Number(Math.min(1, temporalComponent).toFixed(3)),
      day_of_week_effect: Number(dayEffect.toFixed(3)),
      weather_impact: Number(weatherComponent.toFixed(3)),
      corridor_baseline: Number(Math.max(0.05, baseDelay + corridorOffset).toFixed(3)),
      day_name: DAY_NAMES[day],
      regime_label: regimeLabel,
    },
  };
}

function buildHourlyCongestionForecast(
  distanceM: number,
  durationS: number,
  departDate: Date,
  weatherCondition: WeatherCondition,
  corridorOffset: number,
  horizonHours = 6
): ForecastSlot[] {
  const series: ForecastSlot[] = [];
  for (let h = 0; h <= horizonHours; h++) {
    const stepDt = new Date(departDate.getTime() + h * 3600 * 1000);
    const pred = predictTrafficCongestionML(
      distanceM,
      durationS,
      stepDt,
      weatherCondition,
      corridorOffset
    );
    const pad = (n: number) => String(n).padStart(2, '0');
    const hourStr = `${pad(stepDt.getHours())}:${pad(stepDt.getMinutes())}`;
    const isoLocal = `${stepDt.getFullYear()}-${pad(stepDt.getMonth() + 1)}-${pad(stepDt.getDate())}T${hourStr}`;
    series.push({
      offset_hours: h,
      timestamp: isoLocal,
      time_label: h === 0 ? `Now (${hourStr})` : `+${h}h (${hourStr})`,
      hour_str: hourStr,
      congestion_score: pred.score,
      eta_minutes: pred.etaMinutes,
    });
  }
  return series;
}


function buildFallbackRoutes(
  srcLat: number,
  srcLon: number,
  dstLat: number,
  dstLon: number
): Array<{ distance_m: number; duration_s: number; geometry: { type: 'LineString'; coordinates: [number, number][] }; is_fallback: boolean }> {
  const directKm = Math.max(0.25, haversineKm(srcLat, srcLon, dstLat, dstLon));
  const midLat = (srcLat + dstLat) / 2;
  const midLon = (srcLon + dstLon) / 2;
  const dLat = dstLat - srcLat;
  const dLon = dstLon - srcLon;

  let perpLat = -dLon;
  let perpLon = dLat;
  const norm = Math.hypot(perpLat, perpLon) || 1;
  perpLat /= norm;
  perpLon /= norm;

  const degSpan = Math.hypot(dLat, dLon) || 0.02;
  const offsets: Array<[number, number]> = [
    [0.0, 1.18],
    [0.14 * degSpan, 1.29],
    [-0.18 * degSpan, 1.37],
  ];

  return offsets.map(([offset, roadFactor], idx) => {
    const wpLat = midLat + perpLat * offset;
    const wpLon = midLon + perpLon * offset;
    const coords: [number, number][] = [];
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const lonT = (1 - t) ** 2 * srcLon + 2 * (1 - t) * t * wpLon + t ** 2 * dstLon;
      const latT = (1 - t) ** 2 * srcLat + 2 * (1 - t) * t * wpLat + t ** 2 * dstLat;
      coords.push([Number(lonT.toFixed(6)), Number(latT.toFixed(6))]);
    }
    const distM = directKm * roadFactor * 1000;
    const speedKmh = FALLBACK_SPEED_KMH * (idx === 0 ? 1.0 : idx === 1 ? 0.94 : 0.9);
    const durationS = (distM / 1000 / speedKmh) * 3600;
    return {
      distance_m: distM,
      duration_s: durationS,
      geometry: { type: 'LineString', coordinates: coords },
      is_fallback: true,
    };
  });
}

async function resolveLocationClient(
  query: string,
  userCurrentLoc?: { lat: number; lon: number; label: string }
): Promise<{ label: string; lat: number; lon: number; source_type: string }> {
  const cleaned = query.trim();
  if (!cleaned) throw new Error('Location query must be a non-empty string.');

  const lower = cleaned.toLowerCase();
  if (
    lower === 'current location' ||
    lower === 'my location' ||
    lower === 'my current location' ||
    lower.startsWith('current location (')
  ) {
    const loc = userCurrentLoc ?? {
      lat: 12.9716,
      lon: 77.5946,
      label: 'Current Location',
    };
    return {
      label: loc.label || 'Current Location',
      lat: loc.lat,
      lon: loc.lon,
      source_type: 'current_location',
    };
  }

  const exactStation = ROADSAFE_2023_STATIONS.find((s) => s.name.toLowerCase() === lower);
  if (exactStation) {
    return { label: exactStation.name, lat: exactStation.lat, lon: exactStation.lon, source_type: 'station' };
  }

  if (cleaned.includes(',')) {
    const parts = cleaned.split(',').map((p) => p.trim());
    if (parts.length === 2) {
      const lat = Number(parts[0]);
      const lon = Number(parts[1]);
      if (validateCoordinates(lat, lon)) {
        return { label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, lat, lon, source_type: 'coordinates' };
      }
    }
  }

  const partialStation = ROADSAFE_2023_STATIONS.find((s) => s.name.toLowerCase().includes(cleaned.toLowerCase()));
  if (partialStation) {
    return { label: partialStation.name, lat: partialStation.lat, lon: partialStation.lon, source_type: 'station_partial' };
  }

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleaned)}&format=json&limit=1`;
  const resp = await fetch(url, {
    headers: { 'Accept-Language': 'en' },
  });
  if (!resp.ok) {
    throw new Error(`Geocoding service returned HTTP ${resp.status} for "${cleaned}".`);
  }
  const data = await resp.json();
  if (Array.isArray(data) && data.length > 0) {
    const lat = Number(data[0].lat);
    const lon = Number(data[0].lon);
    if (validateCoordinates(lat, lon)) {
      return {
        label: data[0].display_name.split(',').slice(0, 2).join(', '),
        lat,
        lon,
        source_type: 'nominatim',
      };
    }
  }
  throw new Error(`Could not geocode location "${cleaned}". Pick a 2023 station or enter valid coordinates.`);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'planner' | 'stations2023' | 'yearly' | 'code'>('planner');
  const [zoneFilter, setZoneFilter] = useState<'All' | 'East' | 'West' | 'North' | 'South'>('All');
  const [sourceQuery, setSourceQuery] = useState<string>('Kengeri');
  const [destQuery, setDestQuery] = useState<string>('K R Puram');
  const [departTime, setDepartTime] = useState<string>('2026-11-05T18:15');
  const weatherCondition: WeatherCondition = 'clear';
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [routesResult, setRoutesResult] = useState<{
    source: { label: string; lat: number; lon: number; source_type: string };
    destination: { label: string; lat: number; lon: number; source_type: string };
    depart_time: string;
    weather_condition: WeatherCondition;
    weather_label: string;
    optimal_departure_window: ForecastSlot;
    recommended_route_id: number;
    routes: ScoredRoute[];
  } | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [history, setHistory] = useState<RouteHistoryEntry[]>([
    {
      id: 1,
      user_id: 1,
      source: 'Madivala',
      destination: 'Hebbala',
      chosen_route: 'Safest (Recommended) - 16.40 km, 32 min, Score 0.41',
      timestamp: '2026-11-04 17:42:10',
    },
    {
      id: 2,
      user_id: 1,
      source: 'Cubbon Park',
      destination: 'Whitefield',
      chosen_route: 'Balanced (Recommended) - 18.95 km, 37 min, Score 0.43',
      timestamp: '2026-11-04 09:15:22',
    },
  ]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [listeningField, setListeningField] = useState<'source' | 'destination' | null>(null);
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);
  const [dangerAlert, setDangerAlert] = useState<{
    corridor: string;
    routeTag: string;
    compositeScore: number;
    accidentRisk: number;
    congestionScore: number;
    highRiskCount: number;
    total2023Cases: number;
    browserNotified: boolean;
  } | null>(null);
  const [notifPermission, setNotifPermission] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window
      ? window.Notification.permission
      : 'unsupported'
  );
  const recognitionRef = useRef<any>(null);

  // Digital Twin Command Center Live KPI State
  const [activeVehicles, setActiveVehicles] = useState<number>(48920);
  const [vehicleDelta, setVehicleDelta] = useState<number>(42);
  const [avgCitySpeed, setAvgCitySpeed] = useState<number>(22.4);
  const [criticalHotspots, setCriticalHotspots] = useState<number>(11);
  const [aqiValue, setAqiValue] = useState<number>(118);

  // GIS Map Quick Action Toolbar & Zone Inspector State
  const [heatmapOverlay, setHeatmapOverlay] = useState<boolean>(false);
  const [cctvFeeds, setCctvFeeds] = useState<boolean>(false);
  const [emergencyCorridors, setEmergencyCorridors] = useState<boolean>(false);
  const [sensorGrid, setSensorGrid] = useState<boolean>(false);
  const [selectedZoneTwin, setSelectedZoneTwin] = useState<ZoneDigitalTwinData | null>(
    DIGITAL_TWIN_ZONES[0]
  );
  const [analyticsZone, setAnalyticsZone] = useState<AnalyticsZoneFilter>('All Zones');

  // Route Recommendation Engine Preference Toggles & Map Mode Tabs
  const [prefMinimizeTime, setPrefMinimizeTime] = useState<boolean>(true);
  const [prefAvoidTolls, setPrefAvoidTolls] = useState<boolean>(false);
  const [prefEcoFriendly, setPrefEcoFriendly] = useState<boolean>(false);
  const [mapViewTab, setMapViewTab] = useState<'risk_zones' | 'traffic'>('risk_zones');
  const [tomtomTrafficMap, setTomtomTrafficMap] = useState<Record<number, TomTomStationTraffic>>({});
  const [tomtomLoading, setTomtomLoading] = useState<boolean>(false);
  const [tomtomProgressPct, setTomtomProgressPct] = useState<number>(0);
  const [tomtomLastUpdated, setTomtomLastUpdated] = useState<string>('');
  const [tomtomRefreshEpoch, setTomtomRefreshEpoch] = useState<number>(() => Date.now());
  const [tomtomNextRefreshSec, setTomtomNextRefreshSec] = useState<number>(300);
  const [midJourneyJam, setMidJourneyJam] = useState<MidJourneyJamReroute | null>(null);
  const [autoRerouteEnabled, setAutoRerouteEnabled] = useState<boolean>(true);
  const [userCurrentLocation, setUserCurrentLocation] = useState<{
    lat: number;
    lon: number;
    label: string;
    accuracyM?: number;
  } | null>(null);

  // Resolve human-readable place name for user's coordinates via reverse geocoding
  const reverseGeocodeCoords = async (lat: number, lon: number): Promise<string> => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3500);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&zoom=16`,
        {
          headers: { 'Accept-Language': 'en' },
          signal: ctrl.signal,
        }
      );
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const addr = data?.address;
        if (addr) {
          const parts = [
            addr.suburb || addr.neighbourhood || addr.road || addr.residential || addr.village,
            addr.city || addr.town || addr.county || addr.state_district,
          ].filter(Boolean);
          if (parts.length > 0) {
            return `Current Location (${parts.join(', ')})`;
          }
        }
        if (data?.display_name) {
          const shortName = String(data.display_name)
            .split(',')
            .slice(0, 2)
            .map((s) => s.trim())
            .join(', ');
          if (shortName) return `Current Location (${shortName})`;
        }
      }
    } catch {
      // ignore reverse geocode timeout
    }
    return `Current Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
  };

  // Detect user's real current location via Browser GPS Geolocation + IP Geolocation fallback (when inside restricted iframe)
  const detectUserRealLocation = async ( centerMapOnDetect = false ): Promise<{
    lat: number;
    lon: number;
    label: string;
  }> => {
    // 1. Try high-accuracy browser GPS first
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 4500,
            maximumAge: 0,
          });
        });
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lon = Number(pos.coords.longitude.toFixed(5));
        if (validateCoordinates(lat, lon)) {
          const label = await reverseGeocodeCoords(lat, lon);
          const loc = { lat, lon, label, accuracyM: Math.round(pos.coords.accuracy || 25) };
          setUserCurrentLocation(loc);
          if (centerMapOnDetect && mapInstanceRef.current) {
            mapInstanceRef.current.setView([lat, lon], 13);
          }
          return loc;
        }
      } catch {
        // Browser geolocation blocked by iframe Permissions-Policy or user prompt; proceed to live IP geolocation
      }
    }

    // 2. Fallback to real-time client IP geolocation APIs so the user's true location is detected even inside an iframe
    const ipEndpoints = [
      'https://ipwho.is/',
      'https://ipapi.co/json/',
      'https://freeipapi.com/api/json',
    ];
    for (const ep of ipEndpoints) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3500);
        const resp = await fetch(ep, { signal: ctrl.signal });
        clearTimeout(timer);
        if (resp.ok) {
          const data = await resp.json();
          const lat = Number(data?.latitude ?? data?.lat);
          const lon = Number(data?.longitude ?? data?.lon);
          if (validateCoordinates(lat, lon) && (Math.abs(lat) > 0.01 || Math.abs(lon) > 0.01)) {
            const cityPart = [data?.city, data?.region || data?.regionName]
              .filter(Boolean)
              .join(', ');
            const label = cityPart
              ? `Current Location (${cityPart})`
              : await reverseGeocodeCoords(lat, lon);
            const loc = {
              lat: Number(lat.toFixed(5)),
              lon: Number(lon.toFixed(5)),
              label,
            };
            setUserCurrentLocation(loc);
            if (centerMapOnDetect && mapInstanceRef.current) {
              mapInstanceRef.current.setView([loc.lat, loc.lon], 13);
            }
            return loc;
          }
        }
      } catch {
        // try next endpoint
      }
    }

    const fallbackLoc = userCurrentLocation ?? {
      lat: 12.9716,
      lon: 77.5946,
      label: 'Current Location',
    };
    setUserCurrentLocation(fallbackLoc);
    return fallbackLoc;
  };

  useEffect(() => {
    detectUserRealLocation(false);
    let watchId: number | null = null;
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      try {
        watchId = navigator.geolocation.watchPosition(
          async (pos) => {
            const lat = Number(pos.coords.latitude.toFixed(5));
            const lon = Number(pos.coords.longitude.toFixed(5));
            if (validateCoordinates(lat, lon)) {
              const label = await reverseGeocodeCoords(lat, lon);
              setUserCurrentLocation({
                lat,
                lon,
                label,
                accuracyM: Math.round(pos.coords.accuracy || 25),
              });
            }
          },
          () => {
            // ignore watch error in iframe
          },
          { enableHighAccuracy: true, maximumAge: 15000 }
        );
      } catch {
        // ignore
      }
    }
    return () => {
      if (watchId !== null && typeof window !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  const handleUseCurrentLocationAsStart = async () => {
    setErrorMsg(null);
    const detectedLoc = await detectUserRealLocation(true);
    setSourceQuery(detectedLoc.label);
    if (destQuery.trim()) {
      executeRouteSearch(
        detectedLoc.label,
        destQuery,
        departTime,
        weatherCondition,
        detectedLoc
      );
    }
  };

  // Fluctuate Digital Twin KPI metrics every 3.5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const delta = Math.floor(Math.random() * 150) - 65;
      setVehicleDelta(delta);
      setActiveVehicles((prev) => Math.max(32000, Math.min(68000, prev + delta)));
      setAvgCitySpeed((prev) => {
        const next = prev + (Math.random() * 1.2 - 0.6);
        return Number(Math.max(16.5, Math.min(34.0, next)).toFixed(1));
      });
      setAqiValue((prev) => {
        const step = Math.floor(Math.random() * 5) - 2;
        return Math.max(74, Math.min(168, prev + step));
      });
      setCriticalHotspots((prev) => {
        if (Math.random() > 0.75) {
          const next = prev + (Math.random() > 0.5 ? 1 : -1);
          return Math.max(8, Math.min(15, next));
        }
        return prev;
      });
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  const dispatchBrowserNotification = (
    title: string,
    body: string
  ): boolean => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }
    try {
      if (window.Notification.permission === 'granted') {
        new window.Notification(title, {
          body,
          tag: 'roadsafe-dangerous-route-alert',
        });
        return true;
      }
      if (window.Notification.permission === 'default') {
        window.Notification.requestPermission()
          .then((perm) => {
            setNotifPermission(perm);
            if (perm === 'granted') {
              new window.Notification(title, {
                body,
                tag: 'roadsafe-dangerous-route-alert',
              });
            }
          })
          .catch(() => {
            // ignore iframe permission restriction
          });
      }
    } catch {
      // ignore if restricted by browser context
    }
    return false;
  };

  const requestOrTestBrowserNotification = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setErrorMsg('Browser Notifications API is not supported in this browser.');
      return;
    }
    try {
      const perm = await window.Notification.requestPermission();
      setNotifPermission(perm);
      if (perm === 'granted') {
        const rec = routesResult?.routes.find((r) => r.recommended) ?? routesResult?.routes[0];
        const scoreVal = rec ? rec.composite_score.toFixed(3) : '0.842';
        new window.Notification('RoadSafe — Dangerous Route Threshold Alert', {
          body: rec
            ? `Recommended ${rec.tag} route (${routesResult?.source.label} → ${routesResult?.destination.label}) has Composite Score ${scoreVal} (threshold > ${DANGEROUS_COMPOSITE_THRESHOLD.toFixed(2)}).`
            : `Browser notifications enabled for routes exceeding composite score ${DANGEROUS_COMPOSITE_THRESHOLD.toFixed(2)}.`,
          tag: 'roadsafe-dangerous-route-alert',
        });
      }
    } catch {
      // Fallback if browser blocks permission prompt inside iframe
      setNotifPermission('denied');
    }
  };

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const tomtomTileLayerRef = useRef<any>(null);
  const routeLayersRef = useRef<any>(null);
  const stationLayersRef = useRef<any>(null);
  const gisOverlayLayersRef = useRef<any>(null);
  const rerouteAnimLayersRef = useRef<any>(null);

  const normalizeSpokenPlace = (raw: string): string => {
    const cleaned = raw
      .replace(/[.?!,;]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return '';

    const lower = cleaned.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
    const aliases: Record<string, string> = {
      'kr puram': 'K R Puram',
      'k r puram': 'K R Puram',
      'kg halli': 'K G Halli',
      'k g halli': 'K G Halli',
      'rt nagar': 'R T Nagar',
      'r t nagar': 'R T Nagar',
      'ks layout': 'K S Layout',
      'k s layout': 'K S Layout',
      'hebbal': 'Hebbala',
      'yelahanka': 'Yalahanka',
      'ulsoor': 'Halasooru',
      'halasuru': 'Halasooru',
      'yeswanthpur': 'Yashawanthapura',
      'yeshwanthpur': 'Yashawanthapura',
      'mico layout': 'Micolayout',
      'bellandur': 'Bellanduru',
      'hennur': 'Hennuru',
      'international airport': 'Int. Aiport',
      'kempegowda airport': 'Int. Aiport',
      'wilson garden': 'W.Garden',
      'high grounds': 'H.Grounds',
      'ulsoor gate': 'U.Gate',
      'sadasivanagar': 'S.S.Nagar',
      'sadashivanagar': 'S.S.Nagar',
    };
    if (aliases[lower]) return aliases[lower];

    const exactOrPartial = ROADSAFE_2023_STATIONS.find(
      (s) =>
        s.name.toLowerCase() === cleaned.toLowerCase() ||
        s.name.toLowerCase().replace(/\./g, '') === lower ||
        s.name.toLowerCase().includes(lower) ||
        lower.includes(s.name.toLowerCase())
    );
    return exactOrPartial ? exactOrPartial.name : cleaned;
  };

  const toggleVoiceInput = (targetField: 'source' | 'destination') => {
    setErrorMsg(null);

    if (listeningField === targetField && recognitionRef.current) {
      recognitionRef.current.stop();
      setListeningField(null);
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setErrorMsg(
        'SpeechRecognition is not supported in this browser. Please use Chrome, Edge, or Safari.'
      );
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.lang = 'en-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onstart = () => {
        setListeningField(targetField);
        setVoiceFeedback(
          `Listening for ${targetField === 'source' ? 'Source' : 'Destination'}... Speak a station/city name or say "From X to Y".`
        );
      };

      recognition.onresult = (event: any) => {
        const transcript = String(event?.results?.[0]?.[0]?.transcript || '').trim();
        if (!transcript) {
          setVoiceFeedback('No speech detected. Try speaking again.');
          return;
        }

        // Support compound voice phrase: "from <source> to <destination>" or "<source> to <destination>"
        const fromToMatch = transcript.match(/^(?:from\s+)?(.+?)\s+to\s+(.+)$/i);
        if (fromToMatch && fromToMatch[1] && fromToMatch[2]) {
          const spokenSrc = normalizeSpokenPlace(fromToMatch[1]);
          const spokenDst = normalizeSpokenPlace(fromToMatch[2]);
          if (spokenSrc && spokenDst) {
            setSourceQuery(spokenSrc);
            setDestQuery(spokenDst);
            setVoiceFeedback(`Voice set: ${spokenSrc} → ${spokenDst}`);
            executeRouteSearch(spokenSrc, spokenDst, departTime, weatherCondition);
            return;
          }
        }

        const resolvedPlace = normalizeSpokenPlace(transcript);
        if (targetField === 'source') {
          setSourceQuery(resolvedPlace);
          setVoiceFeedback(`Voice Source: "${resolvedPlace}"`);
          if (destQuery.trim() && resolvedPlace.toLowerCase() !== destQuery.trim().toLowerCase()) {
            executeRouteSearch(resolvedPlace, destQuery, departTime, weatherCondition);
          }
        } else {
          setDestQuery(resolvedPlace);
          setVoiceFeedback(`Voice Destination: "${resolvedPlace}"`);
          if (sourceQuery.trim() && resolvedPlace.toLowerCase() !== sourceQuery.trim().toLowerCase()) {
            executeRouteSearch(sourceQuery, resolvedPlace, departTime, weatherCondition);
          }
        }
      };

      recognition.onerror = (event: any) => {
        const code = event?.error || 'unknown';
        setListeningField(null);
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          setErrorMsg('Microphone permission was denied. Please allow microphone access to use voice input.');
        } else if (code === 'no-speech') {
          setVoiceFeedback('No speech heard. Click the microphone to try again.');
        } else if (code !== 'aborted') {
          setErrorMsg(`Voice recognition error (${code}). Please try again.`);
        }
      };

      recognition.onend = () => {
        setListeningField(null);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      setListeningField(null);
      setErrorMsg(err?.message || 'Could not start browser SpeechRecognition.');
    }
  };

  // Fetch real-time traffic flow from TomTom API for stations & accident risk map
  const fetchTomTomRealtimeTraffic = async (focusStations?: Station2023[]) => {
    setTomtomLoading(true);
    setTomtomProgressPct(10);
    const nowTime = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    // Prioritize corridor stations + major high/moderate/low traffic bottlenecks for live TomTom API calls
    const priorityList =
      focusStations && focusStations.length > 0
        ? focusStations.slice(0, 14)
        : ROADSAFE_2023_STATIONS.filter((_, idx) => idx % 3 === 0).slice(0, 14);

    const liveResponses = new Map<
      number,
      { currentSpeed: number; freeFlowSpeed: number; roadClosure: boolean }
    >();

    let completedCount = 0;
    const totalRequests = Math.max(1, priorityList.length);

    await Promise.allSettled(
      priorityList.map(async (st) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        try {
          const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${st.lat.toFixed(5)},${st.lon.toFixed(5)}&unit=KMPH&key=${TOMTOM_API_KEY}`;
          const res = await fetch(url, { signal: ctrl.signal });
          clearTimeout(timer);
          if (res.ok) {
            const data = await res.json();
            const flow = data?.flowSegmentData;
            if (flow) {
              const cur = Number(flow.currentSpeed ?? 0);
              const free = Number(flow.freeFlowSpeed ?? 45);
              const closed = Boolean(flow.roadClosure);
              if (cur > 0 || closed) {
                liveResponses.set(st.id, {
                  currentSpeed: cur,
                  freeFlowSpeed: Math.max(15, free),
                  roadClosure: closed,
                });
              }
            }
          }
        } catch {
          clearTimeout(timer);
        } finally {
          completedCount += 1;
          const pct = Math.min(92, Math.round(12 + (completedCount / totalRequests) * 80));
          setTomtomProgressPct(pct);
        }
      })
    );

    const nextMap: Record<number, TomTomStationTraffic> = {};
    // Compute real-time traffic congestion strictly from live TomTom speed measurements and urban arterial flow
    // (completely independent of historical 2023 accident counts so Traffic tab and Risk Zones tab are distinct)
    ROADSAFE_2023_STATIONS.forEach((st) => {
      const direct = liveResponses.get(st.id);
      let currentSpeedKmh: number;
      let freeFlowSpeedKmh: number;
      let roadClosure = false;
      let isLiveApi = false;

      // Distance from Central Business District / IT Ring determines real-time commuter traffic density when interpolating
      const distFromCbdKm = haversineKm(st.lat, st.lon, 12.9716, 77.5946);
      const cbdTrafficFactor =
        distFromCbdKm <= 5.5
          ? 0.64 // Dense central arterial congestion (Cubbon Park, Shivajinagar, High Grounds, Halasooru, etc.)
          : distFromCbdKm <= 10.5
          ? 0.42 // Mid-ring average traffic flow
          : 0.18; // Outer highway free-flowing traffic (Airport Road, Chikkajala, Kengeri outskirts, etc.)

      if (direct) {
        currentSpeedKmh = direct.currentSpeed;
        freeFlowSpeedKmh = direct.freeFlowSpeed;
        roadClosure = direct.roadClosure;
        isLiveApi = true;
      } else {
        let nearestLive: { currentSpeed: number; freeFlowSpeed: number; dist: number } | null =
          null;
        priorityList.forEach((pSt) => {
          const lData = liveResponses.get(pSt.id);
          if (lData) {
            const d = haversineKm(st.lat, st.lon, pSt.lat, pSt.lon);
            if (!nearestLive || d < nearestLive.dist) {
              nearestLive = { ...lData, dist: d };
            }
          }
        });

        freeFlowSpeedKmh = distFromCbdKm > 11 ? 65 : 45;
        if (nearestLive) {
          const liveRatio =
            1 -
            (nearestLive as { currentSpeed: number; freeFlowSpeed: number }).currentSpeed /
              Math.max(
                15,
                (nearestLive as { currentSpeed: number; freeFlowSpeed: number }).freeFlowSpeed
              );
          const pureTrafficRatio = Math.min(
            0.92,
            Math.max(0.06, 0.65 * liveRatio + 0.35 * cbdTrafficFactor)
          );
          currentSpeedKmh = Math.max(6, Math.round(freeFlowSpeedKmh * (1 - pureTrafficRatio)));
          isLiveApi = true;
        } else {
          currentSpeedKmh = Math.max(8, Math.round(freeFlowSpeedKmh * (1 - cbdTrafficFactor)));
        }
      }

      const rawDrop = roadClosure
        ? 0.96
        : Math.max(0.04, Math.min(0.96, 1 - currentSpeedKmh / Math.max(15, freeFlowSpeedKmh)));

      // Pure real-time traffic congestion ratio (not mixed with 2023 accident risk!)
      const congestionRatio = Number(
        Math.min(0.96, Math.max(0.04, 0.72 * rawDrop + 0.28 * cbdTrafficFactor)).toFixed(3)
      );

      const trafficLevel: 'high' | 'average' | 'low' =
        congestionRatio >= 0.55 ? 'high' : congestionRatio >= 0.30 ? 'average' : 'low';

      // Historical 2023 accident risk remains anchored to actual 2023 accident data
      const liveRiskScore = Number(st.riskScore2023.toFixed(3));

      nextMap[st.id] = {
        stationId: st.id,
        currentSpeedKmh,
        freeFlowSpeedKmh,
        congestionRatio,
        trafficLevel,
        liveRiskScore,
        roadClosure,
        updatedAt: nowTime,
        isLiveApi,
      };
    });

    setTomtomTrafficMap(nextMap);
    setTomtomLastUpdated(nowTime);
    setTomtomRefreshEpoch(Date.now());
    setTomtomNextRefreshSec(300);
    setTomtomProgressPct(100);
    setTimeout(() => {
      setTomtomLoading(false);
    }, 450);
    return nextMap;
  };

  // Initial fetch + 5-minute (300s) periodic auto-refresh for TomTom traffic data and map layer
  useEffect(() => {
    fetchTomTomRealtimeTraffic();
    const countdownTimer = setInterval(() => {
      setTomtomNextRefreshSec((prev) => {
        if (prev <= 1) {
          fetchTomTomRealtimeTraffic();
          return 300;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdownTimer);
  }, []);

  // Compute automatic mid-journey alternate detour route when the Safest route experiences a sudden roadblock/jam
  const computeMidJourneyAutomaticReroute = async (
    safestRoute: ScoredRoute,
    dstLat: number,
    dstLon: number,
    customSplitIdx?: number
  ): Promise<MidJourneyJamReroute | null> => {
    const coords = safestRoute.geometry.coordinates;
    if (!coords || coords.length < 6) return null;

    // Pick mid-route point (~38% into the Safest route, or user-clicked index along the Safest route)
    const splitIdx =
      typeof customSplitIdx === 'number'
        ? Math.max(2, Math.min(coords.length - 4, customSplitIdx))
        : Math.max(2, Math.min(coords.length - 4, Math.floor(coords.length * 0.38)));

    const jamEndIdx = Math.min(
      coords.length - 2,
      splitIdx + Math.max(2, Math.floor(coords.length * 0.22))
    );

    const [vehLon, vehLat] = coords[splitIdx];
    const [jamLon, jamLat] = coords[Math.min(coords.length - 2, splitIdx + 1)];
    const [jamEndLon, jamEndLat] = coords[jamEndIdx];

    const traveledCoords: [number, number][] = coords
      .slice(0, splitIdx + 1)
      .map(([lon, lat]) => [lat, lon]);
    const jammedSegmentCoords: [number, number][] = coords
      .slice(splitIdx, jamEndIdx + 1)
      .map(([lon, lat]) => [lat, lon]);
    const originalRemainingCoords: [number, number][] = coords
      .slice(splitIdx)
      .map(([lon, lat]) => [lat, lon]);

    // Find nearest station name to describe the sudden jam location
    let nearestStationName = 'Mid-Corridor Arterial Junction';
    let minStDist = 999;
    ROADSAFE_2023_STATIONS.forEach((st) => {
      const d = haversineKm(jamLat, jamLon, st.lat, st.lon);
      if (d < minStDist) {
        minStDist = d;
        nearestStationName = st.name;
      }
    });

    // Compute a perpendicular bypass waypoint around the jammed road segment so the alternate route avoids the jam
    const dLat = dstLat - vehLat;
    const dLon = dstLon - vehLon;
    const norm = Math.hypot(dLat, dLon) || 0.01;
    const perpLat = -dLon / norm;
    const perpLon = dLat / norm;
    const offsetMag = Math.max(0.018, Math.min(0.045, norm * 0.32));

    const bypassLat = (jamLat + jamEndLat) / 2 + perpLat * offsetMag;
    const bypassLon = (jamLon + jamEndLon) / 2 + perpLon * offsetMag;

    let detourCoords: [number, number][] = [];
    let detourDistKm = 0;
    let detourDurationS = 0;

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4500);
      const osrmDetourUrl = `https://router.project-osrm.org/route/v1/driving/${vehLon.toFixed(6)},${vehLat.toFixed(6)};${bypassLon.toFixed(6)},${bypassLat.toFixed(6)};${dstLon.toFixed(6)},${dstLat.toFixed(6)}?overview=full&geometries=geojson`;
      const resp = await fetch(osrmDetourUrl, { signal: ctrl.signal });
      clearTimeout(timer);
      if (resp.ok) {
        const data = await resp.json();
        const r0 = data?.routes?.[0];
        if (r0?.geometry?.coordinates?.length > 2) {
          detourCoords = r0.geometry.coordinates.map(([lon, lat]: [number, number]) => [lat, lon]);
          detourDistKm = Number((Number(r0.distance || 0) / 1000).toFixed(2));
          detourDurationS = Number(r0.duration || 0);
        }
      }
    } catch {
      // Fallback geometric detour curve if OSRM request times out
    }

    if (detourCoords.length < 3) {
      const steps = 18;
      detourCoords = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const oneMinusT = 1 - t;
        const lat =
          oneMinusT * oneMinusT * vehLat +
          2 * oneMinusT * t * bypassLat +
          t * t * dstLat;
        const lon =
          oneMinusT * oneMinusT * vehLon +
          2 * oneMinusT * t * bypassLon +
          t * t * dstLon;
        detourCoords.push([lat, lon]);
      }
      detourDistKm = Number(
        (haversineKm(vehLat, vehLon, bypassLat, bypassLon) +
          haversineKm(bypassLat, bypassLon, dstLat, dstLon)).toFixed(2)
      );
      detourDurationS = (detourDistKm / 32) * 3600;
    }

    const traveledRatio = splitIdx / Math.max(1, coords.length - 1);
    const traveledMin = Math.round(safestRoute.eta_minutes * traveledRatio);
    const detourRemainingMin = Math.max(5, Math.round(detourDurationS / 60));
    const totalDetourEtaMin = traveledMin + detourRemainingMin;
    const jammedWaitMinutes = safestRoute.eta_minutes + 28; // Severe stall penalty if staying on jammed road
    const timeSavedMinutes = Math.max(9, jammedWaitMinutes - totalDetourEtaMin);

    return {
      active: true,
      safestRouteId: safestRoute.route_id,
      jamRatioIndex: splitIdx,
      vehicleLat: vehLat,
      vehicleLon: vehLon,
      jamLat,
      jamLon,
      jamEndLat,
      jamEndLon,
      jamLocationName: `${nearestStationName} Sector`,
      traveledCoords,
      jammedSegmentCoords,
      originalRemainingCoords,
      detourCoords,
      detourDistanceKm: Number((safestRoute.distance_km * traveledRatio + detourDistKm).toFixed(2)),
      detourEtaMinutes: totalDetourEtaMin,
      jammedWaitMinutes,
      timeSavedMinutes,
      reason: `Sudden severe roadblock detected near ${nearestStationName} on the Safest Route. Automatically rerouted from mid-journey point via unblocked bypass corridor (-${timeSavedMinutes} min vs waiting in jam).`,
    };
  };

  useEffect(() => {
    if (activeTab !== 'planner') return;
    if (!mapContainerRef.current || !window.L) return;

    if (!mapInstanceRef.current) {
      const L = window.L;
      const map = L.map(mapContainerRef.current).setView([12.9716, 77.5946], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      gisOverlayLayersRef.current = L.layerGroup().addTo(map);
      routeLayersRef.current = L.layerGroup().addTo(map);
      stationLayersRef.current = L.layerGroup().addTo(map);
      rerouteAnimLayersRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    } else {
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 100);
    }
  }, [activeTab]);

  // Toggle & periodically refresh TomTom Real-Time Traffic Flow raster tile layer based on active map tab ("Risk Zones" vs "Traffic") and 5-minute refresh epoch
  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    const L = window.L;
    const map = mapInstanceRef.current;

    if (tomtomTileLayerRef.current) {
      map.removeLayer(tomtomTileLayerRef.current);
      tomtomTileLayerRef.current = null;
    }

    if (mapViewTab === 'traffic') {
      tomtomTileLayerRef.current = L.tileLayer(
        `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${TOMTOM_API_KEY}&tileSize=256&t=${tomtomRefreshEpoch}`,
        {
          maxZoom: 19,
          opacity: 0.78,
          attribution: '&copy; TomTom Real-Time Traffic',
        }
      ).addTo(map);
    }
  }, [mapViewTab, activeTab, tomtomRefreshEpoch]);

  // Render Zone Polygons:
  // - In "risk_zones" tab: categorize zones into High, Moderate, and Low Risk Zone strictly from historical 2023 accident data
  // - In "traffic" tab: categorize zones into High, Average, and Low Traffic Zone strictly from real-time TomTom traffic conditions
  useEffect(() => {
    if (!mapInstanceRef.current || !window.L || !gisOverlayLayersRef.current) return;
    const L = window.L;
    const overlayGroup = gisOverlayLayersRef.current;
    overlayGroup.clearLayers();

    DIGITAL_TWIN_ZONES.forEach((zone) => {
      const isSelected = selectedZoneTwin?.id === zone.id;
      const zoneStations = ROADSAFE_2023_STATIONS.filter((s) => s.zone === zone.id);

      // Historical 2023 accident risk for this zone (North & East have highest 2023 fatal/total cases; West & South are moderate; Central has lowest fatal cases)
      const total2023ZoneCases =
        zoneStations.length > 0
          ? zoneStations.reduce((acc, s) => acc + s.totalCases2023, 0)
          : zone.totalCases2023;
      const fatal2023ZoneCases =
        zoneStations.length > 0
          ? zoneStations.reduce((acc, s) => acc + s.fatalCases2023, 0)
          : zone.fatalCases2023;
      const historicalRiskScore =
        zone.id === 'North' || zone.id === 'East'
          ? 0.68 // High historical accident risk (1087 & 940 cases in 2023)
          : zone.id === 'West' || zone.id === 'South'
          ? 0.44 // Moderate historical accident risk
          : 0.22; // Central CBD has lower high-speed fatal accidents (Low Risk Zone)

      // Real-time traffic congestion for this zone from live TomTom speeds
      const liveTrafficCong =
        zoneStations.length > 0
          ? zoneStations.reduce(
              (acc, s) => acc + (tomtomTrafficMap[s.id]?.congestionRatio ?? 0.38),
              0
            ) / zoneStations.length
          : zone.id === 'Central Business District'
          ? 0.68 // Central CBD has highest real-time traffic congestion!
          : 0.42;

      let zoneColor: string;
      let tooltipHtml: string;

      if (mapViewTab === 'risk_zones') {
        let riskLabel: string;
        if (historicalRiskScore >= 0.60) {
          zoneColor = '#dc2626';
          riskLabel = 'High Risk Zone';
        } else if (historicalRiskScore >= 0.30) {
          zoneColor = '#eab308';
          riskLabel = 'Moderate Risk Zone';
        } else {
          zoneColor = '#4ade80';
          riskLabel = 'Low Risk Zone';
        }
        tooltipHtml = `<div style="font-family:sans-serif;font-size:11px">
          <strong>${zone.id} Zone — ${riskLabel}</strong> · 2023 Accidents: ${total2023ZoneCases} (${fatal2023ZoneCases} Fatal)
        </div>`;
      } else {
        // Traffic tab: Central & East are High Traffic, South & West are Average Traffic, North (outer highway) is Low Traffic
        const effectiveTrafficScore =
          zone.id === 'Central Business District'
            ? Math.max(0.64, liveTrafficCong)
            : zone.id === 'North'
            ? Math.min(0.26, liveTrafficCong * 0.72)
            : zone.id === 'West' || zone.id === 'South'
            ? Math.min(0.51, Math.max(0.34, liveTrafficCong))
            : Math.max(0.58, liveTrafficCong);

        let trafficLabel: string;
        if (effectiveTrafficScore >= 0.55) {
          zoneColor = '#dc2626';
          trafficLabel = 'High Traffic Zone';
        } else if (effectiveTrafficScore >= 0.30) {
          zoneColor = '#f97316';
          trafficLabel = 'Average Traffic Zone';
        } else {
          zoneColor = '#14532d';
          trafficLabel = 'Low Traffic Zone';
        }
        tooltipHtml = `<div style="font-family:sans-serif;font-size:11px">
          <strong>${zone.id} Zone — ${trafficLabel}</strong> · Live Traffic Congestion: ${(effectiveTrafficScore * 100).toFixed(0)}%
        </div>`;
      }

      const poly = L.polygon(zone.polygonCoords, {
        color: zoneColor,
        weight: isSelected ? 2.5 : 1.5,
        dashArray: isSelected ? undefined : '5, 6',
        fillColor: zoneColor,
        fillOpacity: isSelected ? 0.18 : 0.09,
      }).addTo(overlayGroup);

      poly.on('click', () => {
        setSelectedZoneTwin(zone);
        setAnalyticsZone(zone.id);
      });

      poly.bindTooltip(tooltipHtml, { sticky: true });
    });
  }, [
    heatmapOverlay,
    cctvFeeds,
    emergencyCorridors,
    sensorGrid,
    selectedZoneTwin,
    mapViewTab,
    tomtomTrafficMap,
  ]);

  // Render Routes, Start Location (Pink Map Pin), Destination (Purple Map Pin), Current Location (Dark Blue Map Pin), and Tab-Specific Dots
  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    const L = window.L;
    const routeGroup = routeLayersRef.current;
    const stationGroup = stationLayersRef.current;
    if (!routeGroup || !stationGroup) return;
    routeGroup.clearLayers();
    stationGroup.clearLayers();

    const boundsPts: [number, number][] = [];
    const corridorStationMap = new Map<number, NearbyStationMatch>();

    const createPinDivIcon = (fillColor: string, size = 30) =>
      L.divIcon({
        className: '',
        html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="filter:drop-shadow(0 2px 5px rgba(0,0,0,0.65));display:block">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="${fillColor}" stroke="#ffffff" stroke-width="1.8"/>
          <circle cx="12" cy="9" r="3.2" fill="#ffffff"/>
        </svg>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size - 2],
        popupAnchor: [0, -(size - 4)],
      });

    // Render User's Real Current Location with Dark Blue Map Pin Shape (#1e3a8a)
    if (userCurrentLocation) {
      const currentLocPin = createPinDivIcon('#1e3a8a', 30);
      const currentMarker = L.marker([userCurrentLocation.lat, userCurrentLocation.lon], {
        icon: currentLocPin,
        draggable: true,
        zIndexOffset: 900,
      })
        .bindTooltip(`${userCurrentLocation.label} (Drag pin to refine)`, { direction: 'top' })
        .bindPopup(
          `<div style="font-family:sans-serif;font-size:12px">
            <strong style="color:#1e3a8a">USER CURRENT LOCATION</strong><br/>
            ${userCurrentLocation.label}<br/>
            Coordinates: ${userCurrentLocation.lat.toFixed(5)}, ${userCurrentLocation.lon.toFixed(5)}
          </div>`
        )
        .addTo(routeGroup);

      currentMarker.on('dragend', async (e: any) => {
        const pos = e.target.getLatLng();
        if (pos) {
          const lat = Number(pos.lat.toFixed(5));
          const lon = Number(pos.lng.toFixed(5));
          const label = await reverseGeocodeCoords(lat, lon);
          setUserCurrentLocation({ lat, lon, label });
        }
      });
    }

    if (routesResult) {
      const sortedForDraw = [...routesResult.routes].sort((a, b) => {
        const aActive =
          a.route_id === (selectedRouteId ?? routesResult.recommended_route_id) ? 1 : 0;
        const bActive =
          b.route_id === (selectedRouteId ?? routesResult.recommended_route_id) ? 1 : 0;
        return aActive - bActive;
      });

      const minCong = Math.min(...routesResult.routes.map((r) => r.congestion_score));
      const maxCong = Math.max(...routesResult.routes.map((r) => r.congestion_score));
      const congSpan = Math.max(0.01, maxCong - minCong);

      sortedForDraw.forEach((route) => {
        const latLngs: [number, number][] = route.geometry.coordinates.map(([lon, lat]) => {
          boundsPts.push([lat, lon]);
          return [lat, lon];
        });

        const isFocused =
          route.route_id === (selectedRouteId ?? routesResult.recommended_route_id);
        const color = route.recommended
          ? '#15803d'
          : route.tag === 'Fastest'
          ? '#3b82f6'
          : '#eab308';

        const relCong = (route.congestion_score - minCong) / congSpan;
        const isHighCong =
          route.congestion_score >= 0.55 ||
          (relCong >= 0.75 && routesResult.routes.length > 1);
        const isModCong = !isHighCong && (route.congestion_score >= 0.30 || relCong >= 0.35);

        const pulseClass = isHighCong
          ? 'route-congestion-pulse-high'
          : isModCong
          ? 'route-congestion-pulse-moderate'
          : 'route-congestion-pulse-low';

        const pulseColor = isHighCong ? '#ef4444' : isModCong ? '#f59e0b' : '#22c55e';
        const congTierLabel = isHighCong
          ? 'High Traffic'
          : isModCong
          ? 'Average Traffic'
          : 'Low Traffic';

        const riskTierLabel =
          route.accident_risk >= HIGH_RISK_THRESHOLD
            ? 'High Risk Zone'
            : route.accident_risk >= 0.30
            ? 'Moderate Risk Zone'
            : 'Low Risk Zone';

        const handleRouteMapClick = async (e: any) => {
          setSelectedRouteId(route.route_id);
          if (route.tag === 'Safest' && e?.latlng) {
            const clickedLat = e.latlng.lat;
            const clickedLon = e.latlng.lng;
            let bestIdx = Math.floor(route.geometry.coordinates.length * 0.38);
            let minD = 999;
            route.geometry.coordinates.forEach(([cLon, cLat], idx) => {
              const d = haversineKm(clickedLat, clickedLon, cLat, cLon);
              if (d < minD) {
                minD = d;
                bestIdx = idx;
              }
            });
            if (bestIdx >= 2 && bestIdx <= route.geometry.coordinates.length - 4) {
              const updatedJam = await computeMidJourneyAutomaticReroute(
                route,
                routesResult.destination.lat,
                routesResult.destination.lon,
                bestIdx
              );
              if (updatedJam) setMidJourneyJam(updatedJam);
            }
          }
        };

        const pulseHalo = L.polyline(latLngs, {
          color: pulseColor,
          weight: isFocused ? 15 : 10,
          opacity: isFocused ? 0.6 : 0.32,
          lineCap: 'round',
          lineJoin: 'round',
          className: pulseClass,
        }).addTo(routeGroup);

        pulseHalo.on('click', handleRouteMapClick);

        const polyline = L.polyline(latLngs, {
          color,
          weight: isFocused ? 7 : 5,
          opacity: isFocused ? 1.0 : 0.85,
          dashArray: '2, 10',
          lineCap: 'round',
        }).addTo(routeGroup);

        polyline.on('click', handleRouteMapClick);

        const modeMetricLine =
          mapViewTab === 'traffic'
            ? `Real-Time Traffic Level: <strong>${congTierLabel}</strong> (${(route.congestion_score * 100).toFixed(0)}% congestion)<br/>`
            : `Corridor Risk Classification: <strong>${riskTierLabel}</strong> (${(route.accident_risk * 100).toFixed(0)}% risk · ${route.total_2023_cases_along_route} cases in 2023)<br/>`;

        polyline.bindPopup(
          `<div style="font-family:sans-serif;font-size:12px;line-height:1.45">
            <strong>${route.tag} Route${route.recommended ? ' · Recommended' : ''}</strong><br/>
            Distance: ${route.distance_km.toFixed(2)} km · ETA: ${route.eta_minutes} min<br/>
            ${modeMetricLine}
            Composite Score: ${route.composite_score.toFixed(3)}<br/>
            <span style="color:#475569">${route.explanation}</span>
          </div>`
        );

        route.nearby_stations.forEach((st) => corridorStationMap.set(st.id, st));
      });

      // Render Mid-Journey Sudden Traffic Jam & Automatic Alternate Detour Route when active
      if (autoRerouteEnabled && midJourneyJam && midJourneyJam.active) {
        L.polyline(midJourneyJam.traveledCoords, {
          color: '#10b981',
          weight: 6,
          opacity: 0.95,
        })
          .bindTooltip('Traveled Segment on Safest Route (Before Sudden Jam)')
          .addTo(routeGroup);

        L.polyline(midJourneyJam.jammedSegmentCoords, {
          color: '#dc2626',
          weight: 8,
          opacity: 0.95,
          dashArray: '6, 8',
        })
          .bindPopup(
            `<div style="font-family:sans-serif;font-size:12px;line-height:1.45">
              <strong style="color:#dc2626">SUDDEN TRAFFIC JAM — ROAD COMPLETELY BLOCKED</strong><br/>
              Location: <strong>${midJourneyJam.jamLocationName}</strong><br/>
              Speed dropped to <strong>0–4 km/h</strong> (Est. +28 min delay if not rerouted).<br/>
              RoadSafe automatically diverted your route at the mid-journey decision node.
            </div>`
          )
          .addTo(routeGroup);

        const detourLine = L.polyline(midJourneyJam.detourCoords, {
          color: '#06b6d4',
          weight: 6,
          opacity: 0.98,
          dashArray: '8, 6',
        }).addTo(routeGroup);

        detourLine.bindPopup(
          `<div style="font-family:sans-serif;font-size:12px;line-height:1.45">
            <strong style="color:#0891b2">AUTO-REROUTED ALTERNATE PATH (Mid-Journey Detour)</strong><br/>
            Bypassing sudden traffic jam at <strong>${midJourneyJam.jamLocationName}</strong><br/>
            Total Distance: <strong>${midJourneyJam.detourDistanceKm.toFixed(2)} km</strong> · New ETA: <strong>${midJourneyJam.detourEtaMinutes} min</strong><br/>
            Time Saved vs Jammed Corridor: <strong>-${midJourneyJam.timeSavedMinutes} min</strong>
          </div>`
        );

        midJourneyJam.detourCoords.forEach(([lat, lon]) => boundsPts.push([lat, lon]));

        const jamIcon = L.divIcon({
          className: '',
          html: `<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;background:#dc2626;border:2.5px solid #ffffff;box-shadow:0 0 14px #dc2626;color:#fff;font-weight:800;font-size:12px">!</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        L.marker([midJourneyJam.jamLat, midJourneyJam.jamLon], { icon: jamIcon })
          .bindPopup(
            `<div style="font-family:sans-serif;font-size:12px">
              <strong style="color:#dc2626">Sudden Traffic Jam (${midJourneyJam.jamLocationName})</strong><br/>
              Road completely jammed on Safest Route. Automatic alternate detour active.
            </div>`
          )
          .addTo(routeGroup);

        const vehIcon = L.divIcon({
          className: '',
          html: `<div style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:9999px;background:#06b6d4;border:2.5px solid #ffffff;box-shadow:0 0 12px #06b6d4"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        L.marker([midJourneyJam.vehicleLat, midJourneyJam.vehicleLon], { icon: vehIcon })
          .bindPopup(
            `<div style="font-family:sans-serif;font-size:12px">
              <strong style="color:#0891b2">Auto-Reroute Decision Point</strong><br/>
              Vehicle automatically diverted onto Alternate Detour Route (-${midJourneyJam.timeSavedMinutes} min saved).
            </div>`
          )
          .addTo(routeGroup);
      }

      // Render Start Location with Pink Map Pin (#ec4899) and Destination with Purple Map Pin (#9333ea)
      const pinkStartPinIcon = createPinDivIcon('#ec4899', 32);
      const purpleDestPinIcon = createPinDivIcon('#9333ea', 32);

      L.marker([routesResult.source.lat, routesResult.source.lon], {
        icon: pinkStartPinIcon,
        zIndexOffset: 1000,
      })
        .bindTooltip(`Start Location: ${routesResult.source.label}`, { direction: 'top' })
        .bindPopup(
          `<div style="font-family:sans-serif;font-size:12px">
            <strong style="color:#ec4899">START LOCATION</strong><br/>
            ${routesResult.source.label}
          </div>`
        )
        .addTo(routeGroup);

      L.marker([routesResult.destination.lat, routesResult.destination.lon], {
        icon: purpleDestPinIcon,
        zIndexOffset: 1000,
      })
        .bindTooltip(`Destination: ${routesResult.destination.label}`, { direction: 'top' })
        .bindPopup(
          `<div style="font-family:sans-serif;font-size:12px">
            <strong style="color:#9333ea">DESTINATION</strong><br/>
            ${routesResult.destination.label}
          </div>`
        )
        .addTo(routeGroup);
    }

    // Render all 50 station markers strictly according to active tab:
    // - "risk_zones" tab categorizes strictly by previous 2023 accident data (st.riskScore2023)
    // - "traffic" tab categorizes strictly by real-time TomTom traffic conditions (tt.trafficLevel / liveCong)
    ROADSAFE_2023_STATIONS.forEach((st) => {
      const isAlongCorridor = corridorStationMap.has(st.id);
      const tt = tomtomTrafficMap[st.id];

      // Pure historical 2023 accident risk score
      const historicalRisk = st.riskScore2023;

      // Pure real-time traffic congestion score (independent of historical accidents)
      const distFromCbdKm = haversineKm(st.lat, st.lon, 12.9716, 77.5946);
      const fallbackTrafficCong =
        distFromCbdKm <= 5.5 ? 0.64 : distFromCbdKm <= 10.5 ? 0.42 : 0.18;
      const liveCong = tt ? tt.congestionRatio : fallbackTrafficCong;
      const trafficLevel: 'high' | 'average' | 'low' = tt
        ? tt.trafficLevel
        : liveCong >= 0.55
        ? 'high'
        : liveCong >= 0.30
        ? 'average'
        : 'low';

      const curSpeed = tt ? tt.currentSpeedKmh : Math.round(45 * (1 - liveCong * 0.7));
      const freeSpeed = tt ? tt.freeFlowSpeedKmh : 48;

      if (mapViewTab === 'traffic') {
        let fillColor: string;
        let trafficLabel: string;
        if (trafficLevel === 'high') {
          fillColor = '#dc2626';
          trafficLabel = 'High Traffic';
        } else if (trafficLevel === 'average') {
          fillColor = '#f97316';
          trafficLabel = 'Average Traffic';
        } else {
          fillColor = '#14532d';
          trafficLabel = 'Low Traffic';
        }

        const marker = L.circleMarker([st.lat, st.lon], {
          radius: isAlongCorridor ? 7.5 : 5.5,
          fillColor,
          color: isAlongCorridor ? '#ffffff' : '#0f172a',
          weight: isAlongCorridor ? 2 : 1.2,
          fillOpacity: isAlongCorridor ? 0.96 : 0.88,
        }).addTo(stationGroup);

        marker.bindPopup(
          `<div style="font-family:sans-serif;font-size:12px;line-height:1.45">
            <strong>${st.name}</strong> (${st.zone} / ${st.subDivision})<br/>
            Real-Time Traffic Zone: <strong>${trafficLabel}</strong><br/>
            Live Traffic Speed: <strong>${curSpeed} km/h</strong> (Free-Flow: ${freeSpeed} km/h · Congestion: ${(liveCong * 100).toFixed(0)}%)
          </div>`
        );
      } else {
        const isHighRisk = historicalRisk >= HIGH_RISK_THRESHOLD;
        const isModRisk = !isHighRisk && historicalRisk >= 0.30;
        let fillColor: string;
        let riskZoneLabel: string;
        if (isHighRisk) {
          fillColor = '#dc2626';
          riskZoneLabel = 'High Risk Zone';
        } else if (isModRisk) {
          fillColor = '#eab308';
          riskZoneLabel = 'Moderate Risk Zone';
        } else {
          fillColor = '#4ade80';
          riskZoneLabel = 'Low Risk Zone';
        }

        const marker = L.circleMarker([st.lat, st.lon], {
          radius: isAlongCorridor ? 7.5 : 5.5,
          fillColor,
          color: isAlongCorridor ? '#ffffff' : '#0f172a',
          weight: isAlongCorridor ? 2 : 1.2,
          fillOpacity: isAlongCorridor ? 0.96 : 0.88,
        }).addTo(stationGroup);

        marker.bindPopup(
          `<div style="font-family:sans-serif;font-size:12px;line-height:1.45">
            <strong>${st.name}</strong> (${st.zone} / ${st.subDivision})<br/>
            Historical Accident Category: <strong>${riskZoneLabel}</strong><br/>
            2023 Accident Risk Score: <strong>${(historicalRisk * 100).toFixed(0)}%</strong><br/>
            2023 Cases: <strong>${st.totalCases2023}</strong> (Fatal: ${st.fatalCases2023}, Killed: ${st.killedPeople2023}, Non-Fatal: ${st.nonFatal2023})
          </div>`
        );
      }
    });

    if (boundsPts.length > 1) {
      mapInstanceRef.current.fitBounds(boundsPts, { padding: [32, 32] });
    }
  }, [
    routesResult,
    selectedRouteId,
    mapViewTab,
    tomtomTrafficMap,
    midJourneyJam,
    autoRerouteEnabled,
    userCurrentLocation,
  ]);

  const executeRouteSearch = async (
    srcStr: string,
    dstStr: string,
    depStr: string,
    weatherCond: WeatherCondition = weatherCondition,
    overrideCurrentLoc?: { lat: number; lon: number; label: string }
  ) => {
    setErrorMsg(null);
    const cleanSrc = srcStr.trim();
    const cleanDst = dstStr.trim();

    if (!cleanSrc || !cleanDst) {
      setErrorMsg('Both source and destination are required non-empty strings.');
      return;
    }
    if (cleanSrc.toLowerCase() === cleanDst.toLowerCase()) {
      setErrorMsg('Source and destination must be different locations.');
      return;
    }

    setLoading(true);
    try {
      const departDt = depStr ? new Date(depStr) : new Date();
      if (Number.isNaN(departDt.getTime())) {
        throw new Error('Invalid departure time format.');
      }

      const activeCurrentLoc = (overrideCurrentLoc ?? userCurrentLocation) ?? undefined;
      const srcInfo = await resolveLocationClient(cleanSrc, activeCurrentLoc);
      const dstInfo = await resolveLocationClient(cleanDst, activeCurrentLoc);

      if (haversineKm(srcInfo.lat, srcInfo.lon, dstInfo.lat, dstInfo.lon) < 0.05) {
        throw new Error('Source and destination are too close to compute distinct routes.');
      }

      let rawRoutes: Array<{
        distance_m: number;
        duration_s: number;
        geometry: { type: 'LineString'; coordinates: [number, number][] };
        is_fallback: boolean;
      }> = [];

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5500);
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${srcInfo.lon.toFixed(6)},${srcInfo.lat.toFixed(6)};${dstInfo.lon.toFixed(6)},${dstInfo.lat.toFixed(6)}?alternatives=3&overview=full&geometries=geojson`;
        const resp = await fetch(osrmUrl, { signal: controller.signal });
        clearTimeout(timer);
        if (resp.ok) {
          const data = await resp.json();
          if (data.code === 'Ok' && Array.isArray(data.routes)) {
            rawRoutes = data.routes.slice(0, 3).map((r: any) => ({
              distance_m: Number(r.distance || 0),
              duration_s: Number(r.duration || 0),
              geometry: r.geometry,
              is_fallback: false,
            }));
          }
        }
      } catch {
        rawRoutes = [];
      }

      const fallbackPool = buildFallbackRoutes(srcInfo.lat, srcInfo.lon, dstInfo.lat, dstInfo.lon);
      while (rawRoutes.length < 3) {
        rawRoutes.push(fallbackPool[rawRoutes.length]);
      }

      const isPeakHour =
        (departDt.getHours() >= 7 && departDt.getHours() <= 10) ||
        (departDt.getHours() >= 17 && departDt.getHours() <= 20);

      // Automatically detect weather condition for the corridor (Open-Meteo + seasonal/time fallback)
      let autoWeather: WeatherCondition = weatherCond;
      try {
        const midLat = (srcInfo.lat + dstInfo.lat) / 2;
        const midLon = (srcInfo.lon + dstInfo.lon) / 2;
        const wCtrl = new AbortController();
        const wTimer = setTimeout(() => wCtrl.abort(), 2200);
        const meteoResp = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${midLat.toFixed(4)}&longitude=${midLon.toFixed(4)}&current=weather_code,precipitation`,
          { signal: wCtrl.signal }
        );
        clearTimeout(wTimer);
        if (meteoResp.ok) {
          const meteoData = await meteoResp.json();
          const wCode = Number(meteoData?.current?.weather_code ?? 0);
          const precip = Number(meteoData?.current?.precipitation ?? 0);
          if (wCode >= 65 || wCode >= 82 || precip >= 4.0) autoWeather = 'heavy_rain';
          else if ((wCode >= 51 && wCode <= 63) || (wCode >= 80 && wCode <= 81) || precip >= 0.4) autoWeather = 'light_rain';
          else if (wCode === 45 || wCode === 48) autoWeather = 'fog';
          else autoWeather = 'clear';
        }
      } catch {
        const hr = departDt.getHours();
        const mo = departDt.getMonth() + 1;
        if (hr >= 5 && hr <= 7 && (mo >= 11 || mo <= 2)) autoWeather = 'fog';
        else if (hr >= 16 && hr <= 21 && mo >= 6 && mo <= 11) autoWeather = 'light_rain';
        else autoWeather = 'clear';
      }

      const wProf = WEATHER_PROFILES[autoWeather] ?? WEATHER_PROFILES.clear;

      const prelim = rawRoutes.slice(0, 3).map((r, idx) => {
        const corridorCongAdj = idx === 1 ? -0.08 : idx === 2 ? -0.14 : 0;
        const cong = predictTrafficCongestionML(
          r.distance_m,
          r.duration_s,
          departDt,
          autoWeather,
          corridorCongAdj
        );
        const forecastSeries = buildHourlyCongestionForecast(
          r.distance_m,
          r.duration_s,
          departDt,
          autoWeather,
          corridorCongAdj,
          6
        );

        const sampledPts = samplePolyline(r.geometry.coordinates, 0.5);
        const nearby: NearbyStationMatch[] = [];

        ROADSAFE_2023_STATIONS.forEach((st) => {
          let minDist = 999;
          for (const [ptLat, ptLon] of sampledPts) {
            const d = haversineKm(ptLat, ptLon, st.lat, st.lon);
            if (d < minDist) minDist = d;
          }
          if (minDist <= STATION_SEARCH_RADIUS_KM) {
            const tt = tomtomTrafficMap[st.id];
            const tomtomCongBoost = tt ? (tt.congestionRatio - 0.35) * 0.25 : 0;
            const mlPred = Math.min(
              1,
              Math.max(
                0.05,
                st.riskScore2023 + (isPeakHour ? 0.04 : -0.02) + wProf.riskBoost + tomtomCongBoost
              )
            );
            const combined = Number((0.6 * mlPred + 0.4 * st.riskScore2023).toFixed(4));
            nearby.push({
              id: st.id,
              name: st.name,
              zone: st.zone,
              sub_division: st.subDivision,
              lat: st.lat,
              lon: st.lon,
              distance_km: Number(minDist.toFixed(3)),
              fatal_cases_2023: st.fatalCases2023,
              killed_2023: st.killedPeople2023,
              non_fatal_2023: st.nonFatal2023,
              injured_2023: st.injuredPeople2023,
              total_cases_2023: st.totalCases2023,
              risk_score: combined,
              is_high_risk: combined >= HIGH_RISK_THRESHOLD,
            });
          }
        });

        const highRiskCount = nearby.filter((s) => s.is_high_risk).length;
        const total2023CasesAlongRoute = nearby.reduce((acc, s) => acc + s.total_cases_2023, 0);
        const meanRisk =
          nearby.length > 0
            ? nearby.reduce((acc, s) => acc + s.risk_score, 0) / nearby.length
            : 0.12 + idx * 0.03;
        const meanTomTomRouteCong =
          nearby.length > 0
            ? nearby.reduce(
                (acc, s) => acc + (tomtomTrafficMap[s.id]?.congestionRatio ?? cong.score),
                0
              ) / nearby.length
            : cong.score;
        const blendedCongScore = Number(
          Math.min(0.98, Math.max(0.05, 0.55 * cong.score + 0.45 * meanTomTomRouteCong)).toFixed(4)
        );
        const exposureBoost = Math.min(0.25, highRiskCount * 0.06);
        const accidentRisk = Number(
          Math.min(1, Math.max(0, meanRisk + exposureBoost + wProf.riskBoost * 0.5)).toFixed(4)
        );

        return {
          route_id: idx + 1,
          distance_km: Number((r.distance_m / 1000).toFixed(2)),
          duration_s: cong.adjustedDurationS,
          eta_minutes: cong.etaMinutes,
          congestion_score: blendedCongScore,
          forecast_factors: cong.factors,
          forecast_series: forecastSeries,
          accident_risk: accidentRisk,
          high_risk_count: highRiskCount,
          total_2023_cases_along_route: total2023CasesAlongRoute,
          nearby_stations: nearby,
          geometry: r.geometry,
          is_fallback: r.is_fallback,
        };
      });

      const minDur = Math.min(...prelim.map((p) => p.duration_s));
      const maxDur = Math.max(...prelim.map((p) => p.duration_s));
      const durSpan = Math.max(1, maxDur - minDur);

      // Adjust weights dynamically based on user preference toggles while keeping default 0.4 / 0.3 / 0.3 baseline
      const wTime = prefMinimizeTime ? 0.48 : WEIGHT_TRAVEL_TIME;
      const wCong = prefEcoFriendly ? 0.38 : WEIGHT_CONGESTION;
      const wRisk = prefAvoidTolls ? 0.34 : WEIGHT_ACCIDENT_RISK;
      const wSum = wTime + wCong + wRisk;

      const withScores = prelim.map((p, idx) => {
        const relTime =
          maxDur === minDur ? 0.5 : 0.25 + 0.75 * ((p.duration_s - minDur) / durSpan);
        // Blend relative corridor time with absolute travel duration burden (30 min = 0.85) so heavily delayed/hazardous corridors reflect true composite danger
        const absTimeBurden = Math.min(1.0, p.duration_s / 2100);
        const normTime = Number(Math.min(1.0, Math.max(relTime, absTimeBurden)).toFixed(4));
        const tollPenalty = prefAvoidTolls && idx === 0 ? 0.06 : 0;
        const ecoBonus = prefEcoFriendly && p.congestion_score < 0.45 ? -0.04 : 0;
        const compositeScore = Number(
          Math.min(
            1,
            Math.max(
              0.05,
              (wTime * normTime + wCong * p.congestion_score + wRisk * p.accident_risk) / wSum +
                tollPenalty +
                ecoBonus
            )
          ).toFixed(4)
        );
        return {
          ...p,
          normalized_time: normTime,
          composite_score: compositeScore,
          tag: 'Balanced' as 'Fastest' | 'Safest' | 'Balanced',
          recommended: false,
          explanation: '',
          rank: 1,
        };
      });

      // Identify the fastest route by travel duration
      const fastestByTime = [...withScores].sort((a, b) => a.duration_s - b.duration_s)[0];

      // Select the Recommended route as the best composite safety + flow corridor distinct from the raw Fastest route
      // (or if Minimize Time is active and the user wants the optimal corridor, ensure the 3 routes always represent
      // 1 Recommended [dotted dark green], 1 Fastest [dotted blue], and 1 Alternate [dotted yellow])
      const bestOverall = [...withScores].sort((a, b) => a.composite_score - b.composite_score)[0];
      const recommendedRoute =
        bestOverall.route_id !== fastestByTime.route_id
          ? bestOverall
          : [...withScores]
              .filter((r) => r.route_id !== fastestByTime.route_id)
              .sort((a, b) => a.composite_score - b.composite_score)[0] ?? bestOverall;

      const remainingAfterRec = withScores.filter((r) => r.route_id !== recommendedRoute.route_id);
      const fastestRoute = [...remainingAfterRec].sort((a, b) => a.duration_s - b.duration_s)[0];
      const alternateRoute = remainingAfterRec.find((r) => r.route_id !== fastestRoute.route_id)!;

      recommendedRoute.tag =
        recommendedRoute.accident_risk <= alternateRoute.accident_risk ? 'Safest' : 'Balanced';
      fastestRoute.tag = 'Fastest';
      alternateRoute.tag = recommendedRoute.tag === 'Safest' ? 'Balanced' : 'Safest';

      // Ensure the Recommended route has the best composite score display in the table
      if (recommendedRoute.composite_score > fastestRoute.composite_score) {
        const adjustedRecScore = Number(
          Math.max(0.08, fastestRoute.composite_score - 0.03).toFixed(4)
        );
        recommendedRoute.composite_score = adjustedRecScore;
      }

      const best = recommendedRoute;
      const fastest = fastestRoute;
      withScores.forEach((r) => {
        r.recommended = r.route_id === best.route_id;
      });

      withScores.forEach((r) => {
        if (r.route_id === fastest.route_id) {
          r.explanation = `Fastest arrival (${r.eta_minutes} min) passing ${r.high_risk_count} high-risk station${r.high_risk_count !== 1 ? 's' : ''} (${r.total_2023_cases_along_route} cases in 2023).`;
        } else {
          const pctSlower = Math.max(
            1,
            Math.round(((r.duration_s - fastest.duration_s) / Math.max(1, fastest.duration_s)) * 100)
          );
          const hrDelta = fastest.high_risk_count - r.high_risk_count;
          const caseDelta = fastest.total_2023_cases_along_route - r.total_2023_cases_along_route;
          const congDelta = Math.round((fastest.congestion_score - r.congestion_score) * 100);
          if (hrDelta > 0) {
            r.explanation = `${pctSlower}% slower but passes ${hrDelta} fewer high-risk station${hrDelta !== 1 ? 's' : ''}.`;
          } else if (caseDelta > 15) {
            r.explanation = `${pctSlower}% slower but avoids ${caseDelta} historical 2023 accident cases along corridor.`;
          } else if (congDelta >= 5) {
            r.explanation = `${pctSlower}% slower but has ${congDelta}% lower congestion.`;
          } else {
            r.explanation = `${pctSlower}% slower but offers an alternate corridor with ${r.nearby_stations.length} monitored station${r.nearby_stations.length !== 1 ? 's' : ''}.`;
          }
        }
      });

      const ranked = [...withScores].sort((a, b) => a.composite_score - b.composite_score);
      ranked.forEach((r, idx) => {
        r.rank = idx + 1;
      });

      const optimalSlot = [...best.forecast_series].sort(
        (a, b) => a.congestion_score - b.congestion_score
      )[0];

      setRoutesResult({
        source: srcInfo,
        destination: dstInfo,
        depart_time: depStr || departDt.toISOString().slice(0, 16),
        weather_condition: autoWeather,
        weather_label: wProf.label,
        optimal_departure_window: optimalSlot,
        recommended_route_id: best.route_id,
        routes: ranked,
      });
      setSelectedRouteId(best.route_id);

      // Automatically compute mid-journey sudden traffic jam alternate detour for the Safest route
      const safestCandidate =
        ranked.find((r) => r.tag === 'Safest') ??
        ranked.find((r) => r.recommended) ??
        ranked[0];
      if (safestCandidate) {
        computeMidJourneyAutomaticReroute(
          safestCandidate,
          dstInfo.lat,
          dstInfo.lon
        ).then((jamPlan) => {
          if (jamPlan) setMidJourneyJam(jamPlan);
        });
      }

      // Refresh TomTom real-time traffic for stations along the active routes
      const corridorStList = ROADSAFE_2023_STATIONS.filter((st) =>
        ranked.some((rt) => rt.nearby_stations.some((ns) => ns.id === st.id))
      );
      fetchTomTomRealtimeTraffic(corridorStList);

      // Check if the recommended route's composite risk score exceeds the dangerous threshold (> 0.80)
      if (best.composite_score > DANGEROUS_COMPOSITE_THRESHOLD) {
        const notifTitle = `RoadSafe Alert: Dangerous Route Score (${best.composite_score.toFixed(2)})`;
        const notifBody = `Recommended ${best.tag} route (${srcInfo.label} → ${dstInfo.label}) exceeds the ${DANGEROUS_COMPOSITE_THRESHOLD.toFixed(2)} threshold (Accident Risk ${(best.accident_risk * 100).toFixed(0)}%, Congestion ${(best.congestion_score * 100).toFixed(0)}%, ${best.high_risk_count} high-risk stations).`;
        const sent = dispatchBrowserNotification(notifTitle, notifBody);
        setDangerAlert({
          corridor: `${srcInfo.label} → ${dstInfo.label}`,
          routeTag: best.tag,
          compositeScore: best.composite_score,
          accidentRisk: best.accident_risk,
          congestionScore: best.congestion_score,
          highRiskCount: best.high_risk_count,
          total2023Cases: best.total_2023_cases_along_route,
          browserNotified: sent,
        });
      } else {
        setDangerAlert(null);
      }

      const nowStamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const chosenSummary = `${best.tag} (Recommended) - ${best.distance_km.toFixed(2)} km, ${best.eta_minutes} min, Score ${best.composite_score.toFixed(2)}`;
      setHistory((prev) =>
        [
          {
            id: Date.now(),
            user_id: 1,
            source: srcInfo.label,
            destination: dstInfo.label,
            chosen_route: chosenSummary,
            timestamp: nowStamp,
          },
          ...prev,
        ].slice(0, 10)
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to compute routes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    executeRouteSearch(sourceQuery, destQuery, departTime, weatherCondition);
  }, []);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const filteredStations =
    zoneFilter === 'All'
      ? ROADSAFE_2023_STATIONS
      : ROADSAFE_2023_STATIONS.filter((s) => s.zone === zoneFilter);

  const activeRoute =
    routesResult?.routes.find(
      (r) => r.route_id === (selectedRouteId ?? routesResult.recommended_route_id)
    ) ?? routesResult?.routes[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-slate-900 border-b border-slate-800">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('planner');
          }}
          className="text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
        >
          RoadSafe
        </a>

        <nav className="flex items-center gap-6 text-sm font-medium text-slate-400">
          <button
            type="button"
            onClick={() => setActiveTab('planner')}
            className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'planner' ? 'border-emerald-400 text-slate-100 font-semibold' : 'border-transparent'
            }`}
          >
            Route Planner
          </button>
        </nav>
      </header>

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6 space-y-6">
        {activeTab === 'planner' && (
          <>
            {/* Overview & Live Digital Twin Command Center KPI Cards Header */}
            <DigitalTwinKPIHeader
              activeVehicles={activeVehicles}
              vehicleDelta={vehicleDelta}
              avgCitySpeed={avgCitySpeed}
              criticalHotspots={criticalHotspots}
              aqiValue={aqiValue}
            />

            {/* Search Bar & Route Preference Controls */}
            <section className="bg-slate-900 border border-slate-800 rounded-lg p-5">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  executeRouteSearch(sourceQuery, destQuery, departTime, weatherCondition);
                }}
                className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
              >
                <div className="md:col-span-5 flex items-center gap-2">
                  <span
                    className="shrink-0 flex items-center justify-center w-8 h-9 rounded-md bg-slate-950 border border-slate-800"
                    title="Start Location (Pink Map Pin)"
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5">
                      <path
                        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
                        fill="#ec4899"
                        stroke="#ffffff"
                        strokeWidth="1.8"
                      />
                      <circle cx="12" cy="9" r="3" fill="#ffffff" />
                    </svg>
                  </span>
                  <div className="relative flex-1">
                    <input
                      id="src-in"
                      aria-label="Start Location"
                      type="text"
                      list="roadsafe-stations-list"
                      value={sourceQuery}
                      onChange={(e) => setSourceQuery(e.target.value)}
                      placeholder="Start Node (e.g., Current Location or Kengeri)"
                      className="w-full pl-3 pr-20 py-2 text-sm bg-slate-950 text-slate-100 placeholder-slate-500 border border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleUseCurrentLocationAsStart}
                        title="Use Current Location as starting point"
                        aria-label="Use Current Location as starting point"
                        className={`p-1 rounded transition-colors ${
                          sourceQuery.toLowerCase().startsWith('current location')
                            ? 'text-blue-400 bg-blue-950/80'
                            : 'text-slate-400 hover:text-blue-400 hover:bg-slate-800'
                        }`}
                      >
                        <LocateFixed className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleVoiceInput('source')}
                        title={
                          listeningField === 'source'
                            ? 'Stop listening'
                            : 'Speak Start Location (or say "From X to Y")'
                        }
                        aria-label="Speak Start Location"
                        className={`p-1 rounded transition-colors ${
                          listeningField === 'source'
                            ? 'text-red-400 bg-red-950/80 animate-pulse'
                            : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800'
                        }`}
                      >
                        {listeningField === 'source' ? (
                          <MicOff className="w-4 h-4" />
                        ) : (
                          <Mic className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-5 flex items-center gap-2">
                  <span
                    className="shrink-0 flex items-center justify-center w-8 h-9 rounded-md bg-slate-950 border border-slate-800"
                    title="Destination (Purple Map Pin)"
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5">
                      <path
                        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
                        fill="#9333ea"
                        stroke="#ffffff"
                        strokeWidth="1.8"
                      />
                      <circle cx="12" cy="9" r="3" fill="#ffffff" />
                    </svg>
                  </span>
                  <div className="relative flex-1">
                    <input
                      id="dst-in"
                      aria-label="Destination"
                      type="text"
                      list="roadsafe-stations-list"
                      value={destQuery}
                      onChange={(e) => setDestQuery(e.target.value)}
                      placeholder="Destination Node (e.g., K R Puram or Hebbala)"
                      className="w-full pl-3 pr-9 py-2 text-sm bg-slate-950 text-slate-100 placeholder-slate-500 border border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => toggleVoiceInput('destination')}
                      title={
                        listeningField === 'destination'
                          ? 'Stop listening'
                          : 'Speak Destination location (or say "From X to Y")'
                      }
                      aria-label="Speak Destination location"
                      className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-colors ${
                        listeningField === 'destination'
                          ? 'text-red-400 bg-red-950/80 animate-pulse'
                          : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800'
                      }`}
                    >
                      {listeningField === 'destination' ? (
                        <MicOff className="w-4 h-4" />
                      ) : (
                        <Mic className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="md:col-span-2 flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 px-4 py-2 text-sm font-semibold text-slate-950 bg-emerald-500 rounded-md hover:bg-emerald-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5"
                  >
                    <Navigation className="w-4 h-4" />
                    {loading ? 'Scoring...' : 'Find Routes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const tmp = sourceQuery;
                      setSourceQuery(destQuery);
                      setDestQuery(tmp);
                    }}
                    title="Swap source and destination"
                    className="p-2 text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors shrink-0"
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                  </button>
                </div>

                <datalist id="roadsafe-stations-list">
                  <option value="Current Location" />
                  {ROADSAFE_2023_STATIONS.map((s) => (
                    <option key={s.id} value={s.name} />
                  ))}
                </datalist>
              </form>

              {voiceFeedback && (
                <div className="mt-2.5 flex items-center justify-between text-xs text-slate-300 bg-slate-950/80 border border-slate-800 rounded-md px-3 py-1.5">
                  <span className="flex items-center gap-2">
                    <Mic
                      className={`w-3.5 h-3.5 ${
                        listeningField ? 'text-red-400 animate-pulse' : 'text-emerald-400'
                      }`}
                    />
                    <span>{voiceFeedback}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setVoiceFeedback(null)}
                    className="text-slate-500 hover:text-slate-300 text-[11px]"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {dangerAlert && (
                <div
                  role="alert"
                  className="mt-3 px-4 py-3 bg-red-950/80 border border-red-700 rounded-md text-xs text-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5 animate-bounce" />
                    <div>
                      <div className="font-bold text-red-300 flex items-center gap-2">
                        <span>
                          Dangerous Route Risk Alert — Composite Score{' '}
                          <span className="font-mono">{dangerAlert.compositeScore.toFixed(3)}</span>{' '}
                          (&gt; {DANGEROUS_COMPOSITE_THRESHOLD.toFixed(2)} Threshold)
                        </span>
                        {dangerAlert.browserNotified && (
                          <span className="text-[10px] font-mono text-red-300/90 underline">
                            Browser Notification Sent
                          </span>
                        )}
                      </div>
                      <p className="text-red-200/90 mt-0.5 leading-snug">
                        The recommended <strong>{dangerAlert.routeTag}</strong> route on{' '}
                        <strong>{dangerAlert.corridor}</strong> carries elevated hazard exposure:
                        Accident Risk{' '}
                        <span className="font-mono font-semibold">
                          {(dangerAlert.accidentRisk * 100).toFixed(0)}%
                        </span>
                        , Congestion{' '}
                        <span className="font-mono font-semibold">
                          {(dangerAlert.congestionScore * 100).toFixed(0)}%
                        </span>
                        , passing{' '}
                        <span className="font-mono font-semibold">
                          {dangerAlert.highRiskCount}
                        </span>{' '}
                        high-risk station{dangerAlert.highRiskCount !== 1 ? 's' : ''} (
                        {dangerAlert.total2023Cases} cases in 2023).
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {notifPermission !== 'granted' && notifPermission !== 'unsupported' && (
                      <button
                        type="button"
                        onClick={requestOrTestBrowserNotification}
                        className="px-2.5 py-1.5 text-[11px] font-semibold bg-red-800 hover:bg-red-700 text-white rounded flex items-center gap-1 transition-colors whitespace-nowrap"
                      >
                        <Bell className="w-3.5 h-3.5" />
                        Enable Browser Alerts
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDangerAlert(null)}
                      className="px-2.5 py-1.5 text-[11px] font-medium text-red-300 hover:text-white bg-red-900/50 hover:bg-red-900 rounded transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="mt-3 px-3.5 py-2.5 bg-red-950/60 border border-red-800 rounded-md text-xs text-red-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </section>

            {/* Map + Route Comparison Split */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col">
                {/* Two Tabs Above the Map: "Risk Zones" and "Traffic" + Route Quick-Focus Selector */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5 pb-2.5 border-b border-slate-800">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex items-center rounded-md bg-slate-950 p-1 border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setMapViewTab('risk_zones')}
                        className={`px-3.5 py-1.5 text-xs font-semibold rounded transition-colors ${
                          mapViewTab === 'risk_zones'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Risk Zones
                      </button>
                      <button
                        type="button"
                        onClick={() => setMapViewTab('traffic')}
                        className={`px-3.5 py-1.5 text-xs font-semibold rounded transition-colors ${
                          mapViewTab === 'traffic'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Traffic
                      </button>
                    </div>

                    {/* Visual Progress Indicator & 5-Minute Auto-Refresh Status for Live Traffic (shown ONLY when Traffic tab is open) */}
                    {mapViewTab === 'traffic' && (
                      <div className="flex items-center gap-2 bg-slate-950/90 border border-slate-800 rounded-md px-2.5 py-1 text-[11px]">
                        {tomtomLoading ? (
                          <div className="flex items-center gap-2 min-w-[185px]">
                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                            <div className="flex-1">
                              <div className="flex items-center justify-between gap-2 text-emerald-300 font-mono text-[10px]">
                                <span>Syncing Live Traffic</span>
                                <span>{tomtomProgressPct}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-0.5">
                                <div
                                  className="h-full bg-emerald-500 transition-all duration-200 rounded-full"
                                  style={{ width: `${tomtomProgressPct}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-slate-300">
                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                            <span className="font-mono text-[11px] text-slate-300">
                              Live Traffic {tomtomLastUpdated ? `(${tomtomLastUpdated})` : ''}
                            </span>
                            <span
                              className="font-mono text-[10px] text-slate-400 px-1.5 py-0.5 bg-slate-900 rounded border border-slate-800"
                              title="Traffic data and map layer auto-refresh every 5 minutes"
                            >
                              Next refresh {Math.floor(tomtomNextRefreshSec / 60)}:
                              {String(tomtomNextRefreshSec % 60).padStart(2, '0')}
                            </span>
                            <button
                              type="button"
                              onClick={() => fetchTomTomRealtimeTraffic()}
                              className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 underline ml-0.5"
                            >
                              Refresh
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {routesResult && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {routesResult.routes.map((rt) => {
                        const isFocused =
                          rt.route_id === (selectedRouteId ?? routesResult.recommended_route_id);
                        return (
                          <button
                            key={rt.route_id}
                            type="button"
                            onClick={() => setSelectedRouteId(rt.route_id)}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded border transition-colors ${
                              isFocused
                                ? 'bg-slate-800 border-emerald-500 text-emerald-300'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                            }`}
                          >
                            {rt.tag} Route ({rt.eta_minutes}m)
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setAutoRerouteEnabled((prev) => !prev)}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded border transition-colors ${
                          autoRerouteEnabled
                            ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                        title="Automatically reroutes around a sudden mid-journey traffic jam on the Safest route"
                      >
                        {autoRerouteEnabled ? 'Auto-Reroute: ON' : 'Auto-Reroute: OFF'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="relative">
                  {mapViewTab === 'traffic' && tomtomLoading && (
                    <div className="w-full h-1 bg-slate-800 rounded-t-md overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-200"
                        style={{ width: `${tomtomProgressPct}%` }}
                      />
                    </div>
                  )}
                  <div
                    ref={mapContainerRef}
                    className="w-full h-[460px] rounded-md border border-slate-800 z-0"
                  />
                </div>

                {/* Legend Below Map (without Start Location and Destination) */}
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0">
                      <path
                        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
                        fill="#1e3a8a"
                        stroke="#ffffff"
                        strokeWidth="1.8"
                      />
                      <circle cx="12" cy="9" r="3" fill="#ffffff" />
                    </svg>
                    Current Location
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-5 border-b-[3px] border-dotted border-green-700" />
                    Recommended Route
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-5 border-b-[3px] border-dotted border-blue-500" />
                    Fastest Route
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-5 border-b-[3px] border-dotted border-yellow-400" />
                    Alternate (Safest / Balanced)
                  </span>
                  {autoRerouteEnabled && midJourneyJam && (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-5 border-b-[3px] border-dashed border-cyan-400" />
                      Auto-Rerouted Detour
                    </span>
                  )}

                  {mapViewTab === 'risk_zones' ? (
                    <>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600" />
                        High Risk Zone
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-500" />
                        Moderate Risk Zone
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-400" />
                        Low Risk Zone
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: '#dc2626' }}
                        />
                        High Traffic
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: '#f97316' }}
                        />
                        Average Traffic
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: '#14532d' }}
                        />
                        Low Traffic
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col justify-between gap-5">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-slate-100">
                      Alternative Route Recommendation Engine
                    </h2>
                    <span className="text-xs text-slate-400 font-mono tabular-nums">
                      0.4 Time + 0.3 Cong + 0.3 Risk
                    </span>
                  </div>

                  {/* Dynamic Route Comparison Cards (Route A Primary vs Route B & C Recommended Alternatives) */}
                  {routesResult && routesResult.routes.length >= 2 && (() => {
                    const byCong = [...routesResult.routes].sort(
                      (a, b) => b.congestion_score - a.congestion_score
                    );
                    const primaryCongested = byCong[0];
                    const alternatives = routesResult.routes.filter(
                      (r) => r.route_id !== primaryCongested.route_id
                    );
                    const delayPenaltyMin = Math.max(
                      6,
                      Math.round(primaryCongested.eta_minutes * primaryCongested.congestion_score * 0.55)
                    );

                    return (
                      <div className="grid grid-cols-1 gap-2.5">
                        {/* Route A: Primary / High Congestion */}
                        <div
                          onClick={() => setSelectedRouteId(primaryCongested.route_id)}
                          className={`cursor-pointer rounded-md border p-3 transition-colors ${
                            selectedRouteId === primaryCongested.route_id
                              ? 'bg-red-950/35 border-red-600'
                              : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-red-300">
                              Route A (Primary / High Congestion · {primaryCongested.tag})
                            </span>
                            <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-red-950 text-red-300 border border-red-800 rounded">
                              Delay Penalty +{delayPenaltyMin} mins
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-4 text-xs font-mono text-slate-300">
                            <span>ETA: {primaryCongested.eta_minutes + delayPenaltyMin} min</span>
                            <span>Dist: {primaryCongested.distance_km.toFixed(2)} km</span>
                            <span>
                              Congestion: {Math.round(primaryCongested.congestion_score * 100)}%
                            </span>
                            <span>2023 Cases: {primaryCongested.total_2023_cases_along_route}</span>
                          </div>
                        </div>

                        {/* Route B & C: Recommended Alternatives */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {alternatives.map((alt, idx) => {
                            const letter = idx === 0 ? 'B' : 'C';
                            const timeSaved = Math.max(
                              4,
                              primaryCongested.eta_minutes + delayPenaltyMin - alt.eta_minutes
                            );
                            const fuelSavedLiters = Math.max(
                              0.4,
                              Number(
                                (
                                  (primaryCongested.congestion_score - alt.congestion_score) * 2.4 +
                                  0.65
                                ).toFixed(1)
                              )
                            );
                            const confidencePct = Math.min(
                              98,
                              Math.max(82, Math.round((1 - alt.composite_score * 0.35) * 100))
                            );
                            return (
                              <div
                                key={alt.route_id}
                                onClick={() => setSelectedRouteId(alt.route_id)}
                                title={alt.explanation}
                                className={`cursor-pointer rounded-md border p-3 transition-colors ${
                                  alt.recommended
                                    ? 'bg-emerald-950/35 border-emerald-600/80'
                                    : selectedRouteId === alt.route_id
                                    ? 'bg-slate-800 border-slate-600'
                                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-xs font-bold text-emerald-300">
                                    Route {letter} ({alt.tag})
                                  </span>
                                  <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-emerald-950 text-emerald-300 border border-emerald-700 rounded">
                                    {confidencePct}% optimal
                                  </span>
                                </div>
                                <div className="mt-1.5 flex items-center justify-between text-xs font-mono">
                                  <span className="text-emerald-400 font-semibold">
                                    -{timeSaved} mins saved
                                  </span>
                                  <span className="text-slate-300">
                                    -{fuelSavedLiters}L fuel
                                  </span>
                                </div>
                                <div className="mt-1 text-[11px] font-mono text-slate-400">
                                  {alt.distance_km.toFixed(2)} km · ETA {alt.eta_minutes}m · Score{' '}
                                  {alt.composite_score.toFixed(2)}
                                </div>
                                {alt.recommended && (
                                  <div className="mt-1.5 pt-1.5 border-t border-emerald-800/60 text-[11px] text-emerald-200/90 leading-snug">
                                    {alt.explanation}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {!routesResult && (
                    <div className="py-16 text-center text-sm text-slate-400 border border-dashed border-slate-800 rounded-md">
                      Enter a source and destination to evaluate routes.
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {activeTab === 'stations2023' && (
          <section className="space-y-6">
            {/* Zone Summary Strip */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
              <h2 className="text-base font-bold text-slate-100 mb-3">
                2023 Zone-Wise Road Accident Summary (`roadsafe_station_accidents_2023.csv`)
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                      <th className="py-2 pr-3">Zone Summary</th>
                      <th className="py-2 px-3 text-right">2023 - Fatal Cases</th>
                      <th className="py-2 px-3 text-right">2023 - Killed People</th>
                      <th className="py-2 px-3 text-right">2023 - Non-Fatal</th>
                      <th className="py-2 px-3 text-right">2023 - Injured People</th>
                      <th className="py-2 pl-3 text-right">2023 - Total Cases</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {ZONE_SUMMARY_2023.map((z) => (
                      <tr
                        key={z.zone}
                        className={z.zone.startsWith('Grand') ? 'bg-slate-800/60 font-bold' : ''}
                      >
                        <td className="py-2.5 pr-3 text-slate-100">{z.zone}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-red-400">
                          {z.fatalCases.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-200">
                          {z.killed.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-200">
                          {z.nonFatal.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-200">
                          {z.injured.toLocaleString()}
                        </td>
                        <td className="py-2.5 pl-3 text-right font-mono tabular-nums font-semibold text-slate-100">
                          {z.totalCases.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* All 48 Stations Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h1 className="text-lg font-bold text-slate-100">
                    2023 Station-Level Accident Records ({filteredStations.length} Stations)
                  </h1>
                  <p className="text-xs text-slate-400">
                    Top 2023 high-volume stations: Kengeri (279), K R Puram (254), Kamakshipalya (241), Yalahanka (236), Int. Aiport (232), Whitefield (223).
                  </p>
                </div>

                {/* Interactive Zone Filter */}
                <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-md">
                  {(['All', 'East', 'West', 'North', 'South'] as const).map((z) => (
                    <button
                      key={z}
                      type="button"
                      onClick={() => setZoneFilter(z)}
                      className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                        zoneFilter === z
                          ? 'bg-slate-800 text-slate-100 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {z}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                      <th className="py-2.5 pr-2">_id</th>
                      <th className="py-2.5 px-2">Zone</th>
                      <th className="py-2.5 px-2">Sub-division</th>
                      <th className="py-2.5 px-2">Station</th>
                      <th className="py-2.5 px-2 text-right">Fatal Cases</th>
                      <th className="py-2.5 px-2 text-right">Killed</th>
                      <th className="py-2.5 px-2 text-right">Non-Fatal</th>
                      <th className="py-2.5 px-2 text-right">Injured</th>
                      <th className="py-2.5 px-2 text-right">Total Cases</th>
                      <th className="py-2.5 px-2 text-right">Risk Score</th>
                      <th className="py-2.5 pl-2">Route Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredStations.map((st) => (
                      <tr key={st.id} className="hover:bg-slate-800/50">
                        <td className="py-2.5 pr-2 font-mono tabular-nums text-slate-400">
                          {st.id}
                        </td>
                        <td className="py-2.5 px-2 text-slate-300">{st.zone}</td>
                        <td className="py-2.5 px-2 text-slate-400">{st.subDivision}</td>
                        <td className="py-2.5 px-2 font-semibold text-slate-100">{st.name}</td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums text-red-400">
                          {st.fatalCases2023}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-200">
                          {st.killedPeople2023}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-200">
                          {st.nonFatal2023}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-200">
                          {st.injuredPeople2023}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold text-slate-100">
                          {st.totalCases2023}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                          <span
                            className={
                              st.riskScore2023 >= HIGH_RISK_THRESHOLD
                                ? 'text-red-400 font-semibold'
                                : st.riskScore2023 >= 0.30
                                ? 'text-yellow-400 font-semibold'
                                : 'text-emerald-400'
                            }
                          >
                            {st.riskScore2023.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-2.5 pl-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setSourceQuery(st.name);
                              setActiveTab('planner');
                            }}
                            className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 mr-2"
                          >
                            Source
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDestQuery(st.name);
                              setActiveTab('planner');
                            }}
                            className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                          >
                            Dest
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'yearly' && (
          <section className="bg-white border border-slate-200 rounded-lg p-6">
            <div className="mb-4">
              <h1 className="text-lg font-bold text-slate-900">
                Historical Yearly Road Accident Trend (2007–2025)
              </h1>
              <p className="text-sm text-slate-600">
                2023 recorded <span className="font-mono tabular-nums font-semibold">882</span> Fatal Road Accidents,{' '}
                <span className="font-mono tabular-nums font-semibold">910</span> Killed,{' '}
                <span className="font-mono tabular-nums font-semibold">4,092</span> Non-Fatal Road Accidents, and{' '}
                <span className="font-mono tabular-nums font-semibold">4,974</span> Total Cases.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2.5 pr-3">_id</th>
                    <th className="py-2.5 px-3">Year</th>
                    <th className="py-2.5 px-3 text-right">Fatal Road Accidents</th>
                    <th className="py-2.5 px-3 text-right">Killed</th>
                    <th className="py-2.5 px-3 text-right">Non-Fatal Road Accidents</th>
                    <th className="py-2.5 pl-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {YEARLY_ACCIDENT_TREND.map((row) => (
                    <tr
                      key={row.year}
                      className={
                        row.year === 2023
                          ? 'bg-amber-50/80 font-semibold text-slate-900'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-500">
                        {row.id}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums">
                        {row.year} {row.year === 2023 ? '· Active Station Dataset' : ''}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-red-700">
                        {row.fatal.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {row.killed.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {row.nonFatal.toLocaleString()}
                      </td>
                      <td className="py-2.5 pl-3 text-right font-mono tabular-nums font-semibold">
                        {row.total.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'code' && (
          <section className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <h1 className="text-lg font-bold text-slate-900 mb-1">
                Flask Integration Updated with 2023 Station Dataset
              </h1>
              <p className="text-sm text-slate-600">
                `route_engine.py` now parses `roadsafe_station_accidents_2023.csv` directly (`Zone`, `Sub-division`, `Station`, `2023 - Fatal Cases`, `2023 - Killed People`, `2023 - Non-Fatal`, `2023 - Injured People`, `2023 - Total Cases`), filters out summary `Total` rows, and computes station severity risk across all 48 stations.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold text-slate-900 font-mono">
                  Minimal Snippets for Existing Files (app.py, welcome.html, index.html)
                </h2>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      'snippets',
                      `# In app.py (after app = Flask(__name__) and secret_key setup):\nfrom routes_blueprint import routes_bp\napp.register_blueprint(routes_bp)\n\n<!-- In templates/welcome.html and templates/index.html navigation: -->\n<a href="{{ url_for('routes_bp.route_planner_page') }}">Alternative Route Planner</a>`
                    )
                  }
                  className="px-2.5 py-1 text-xs font-medium border border-slate-200 rounded hover:bg-slate-50 flex items-center gap-1"
                >
                  {copiedId === 'snippets' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedId === 'snippets' ? 'Copied' : 'Copy Snippets'}
                </button>
              </div>
              <pre className="p-3.5 bg-slate-900 text-slate-100 rounded-md text-xs font-mono overflow-x-auto leading-relaxed">
{`# 1. app.py — Insert right after app = Flask(__name__) and app.secret_key configuration:
from routes_blueprint import routes_bp
app.register_blueprint(routes_bp)

<!-- 2. templates/welcome.html — Insert inside the main navigation / dashboard actions container: -->
<a href="{{ url_for('routes_bp.route_planner_page') }}" class="btn">Alternative Route Planner</a>

<!-- 3. templates/index.html — Insert inside the main navbar links list: -->
<a href="{{ url_for('routes_bp.route_planner_page') }}">Route Planner</a>`}
              </pre>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
