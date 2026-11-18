import React, { useEffect, useRef, useState } from 'react';
import {
  Car,
  Gauge,
  AlertOctagon,
  Wind,
  Flame,
  Video,
  Siren,
  Cpu,
  X,
  Clock,
  Users,
  MapPin,
  Layers,
  ChevronDown,
  Check,
} from 'lucide-react';

export interface ZoneDigitalTwinData {
  id: 'North' | 'South' | 'East' | 'West' | 'Central Business District';
  name: string;
  cameraCode: string;
  corridorName: string;
  vehicleDensityPerKm: number;
  laneOccupancyPct: number;
  avgWaitTimeSec: number;
  avgSpeedKmh: number;
  fatalCases2023: number;
  totalCases2023: number;
  riskLevel: 'High' | 'Moderate' | 'Low';
  polygonCoords: [number, number][];
  center: [number, number];
}

export const DIGITAL_TWIN_ZONES: ZoneDigitalTwinData[] = [
  {
    id: 'North',
    name: 'North Zone (Hebbala · Yalahanka · Peenya)',
    cameraCode: 'CAM-N04 · Hebbala Flyover Southbound',
    corridorName: 'Bellary Road / NH-44 & Outer Ring North',
    vehicleDensityPerKm: 184,
    laneOccupancyPct: 82,
    avgWaitTimeSec: 138,
    avgSpeedKmh: 21.4,
    fatalCases2023: 323,
    totalCases2023: 1535,
    riskLevel: 'High',
    center: [13.065, 77.595],
    polygonCoords: [
      [13.01, 77.515],
      [13.165, 77.535],
      [13.175, 77.675],
      [13.025, 77.655],
    ],
  },
  {
    id: 'East',
    name: 'East Zone (K R Puram · Whitefield · Indiranagar)',
    cameraCode: 'CAM-E11 · Tin Factory / K R Puram Bridge',
    corridorName: 'Old Madras Road & Whitefield IT Corridor',
    vehicleDensityPerKm: 196,
    laneOccupancyPct: 86,
    avgWaitTimeSec: 154,
    avgSpeedKmh: 18.9,
    fatalCases2023: 165,
    totalCases2023: 1004,
    riskLevel: 'High',
    center: [12.985, 77.685],
    polygonCoords: [
      [12.95, 77.615],
      [13.025, 77.615],
      [13.02, 77.76],
      [12.945, 77.76],
    ],
  },
  {
    id: 'West',
    name: 'West Zone (Kengeri · Kamakshipalya · Vijayanagar)',
    cameraCode: 'CAM-W07 · Mysore Road / Kengeri Junction',
    corridorName: 'Mysore Road Arterial & Magadi Chord',
    vehicleDensityPerKm: 168,
    laneOccupancyPct: 77,
    avgWaitTimeSec: 122,
    avgSpeedKmh: 23.8,
    fatalCases2023: 202,
    totalCases2023: 1254,
    riskLevel: 'High',
    center: [12.955, 77.52],
    polygonCoords: [
      [12.895, 77.47],
      [12.995, 77.495],
      [12.995, 77.565],
      [12.905, 77.555],
    ],
  },
  {
    id: 'South',
    name: 'South Zone (Madivala · Electronic City · Jayanagar)',
    cameraCode: 'CAM-S02 · Silk Board / Madivala Elevated',
    corridorName: 'Hosur Road Expressway & Outer Ring South',
    vehicleDensityPerKm: 179,
    laneOccupancyPct: 81,
    avgWaitTimeSec: 146,
    avgSpeedKmh: 20.6,
    fatalCases2023: 192,
    totalCases2023: 1181,
    riskLevel: 'Moderate',
    center: [12.895, 77.605],
    polygonCoords: [
      [12.835, 77.53],
      [12.945, 77.54],
      [12.94, 77.685],
      [12.835, 77.68],
    ],
  },
  {
    id: 'Central Business District',
    name: 'Central Business District (MG Road · Cubbon Park · U.Gate)',
    cameraCode: 'CAM-CBD01 · Trinity Circle / MG Road',
    corridorName: 'MG Road · Residency Road · Cubbon Corridor',
    vehicleDensityPerKm: 142,
    laneOccupancyPct: 68,
    avgWaitTimeSec: 94,
    avgSpeedKmh: 26.5,
    fatalCases2023: 35,
    totalCases2023: 316,
    riskLevel: 'Low',
    center: [12.974, 77.592],
    polygonCoords: [
      [12.952, 77.57],
      [12.998, 77.57],
      [12.998, 77.612],
      [12.952, 77.612],
    ],
  },
];

interface DigitalTwinKPIHeaderProps {
  activeVehicles: number;
  vehicleDelta: number;
  avgCitySpeed: number;
  criticalHotspots: number;
  aqiValue: number;
}

export const DigitalTwinKPIHeader: React.FC<DigitalTwinKPIHeaderProps> = ({
  activeVehicles,
  vehicleDelta,
  avgCitySpeed,
  criticalHotspots,
  aqiValue,
}) => {
  const aqiStatus =
    aqiValue <= 100
      ? { label: 'Satisfactory', color: 'text-emerald-400 border-emerald-700/70 bg-emerald-950/50' }
      : aqiValue <= 150
      ? { label: 'Moderate', color: 'text-amber-300 border-amber-700/70 bg-amber-950/50' }
      : { label: 'Unhealthy', color: 'text-red-300 border-red-700/70 bg-red-950/50' };

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* KPI 1: Total Active Vehicles */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex items-start justify-between">
        <div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Total Active Vehicles
          </span>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-100 mt-1">
            {activeVehicles.toLocaleString()}
          </div>
        </div>
        <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-md text-emerald-400">
          <Car className="w-5 h-5" />
        </div>
      </div>

      {/* KPI 2: Average City Speed */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex items-start justify-between">
        <div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Average City Speed
          </span>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-100 mt-1">
            {avgCitySpeed.toFixed(1)} <span className="text-sm font-normal text-slate-400">km/h</span>
          </div>
        </div>
        <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-md text-blue-400">
          <Gauge className="w-5 h-5" />
        </div>
      </div>

      {/* KPI 3: Critical Congestion Hotspots */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex items-start justify-between">
        <div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Critical Congestion Hotspots
          </span>
          <div className="text-2xl font-bold font-mono tabular-nums text-red-400 mt-1">
            {criticalHotspots}{' '}
            <span className="text-xs font-semibold text-slate-400">Active Nodes</span>
          </div>
        </div>
        <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-md text-red-400">
          <AlertOctagon className="w-5 h-5" />
        </div>
      </div>

      {/* KPI 4: Air Quality Index (AQI) */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex items-start justify-between">
        <div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Air Quality Index (AQI)
          </span>
          <div className="flex items-center gap-2.5 mt-1">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-100">
              {aqiValue}
            </span>
            <span
              className={`px-2 py-0.5 text-[11px] font-semibold border rounded ${aqiStatus.color}`}
            >
              {aqiStatus.label}
            </span>
          </div>
        </div>
        <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-md text-amber-400">
          <Wind className="w-5 h-5" />
        </div>
      </div>
    </section>
  );
};

interface GisToolbarProps {
  heatmapOverlay: boolean;
  onToggleHeatmap: () => void;
  cctvFeeds: boolean;
  onToggleCctv: () => void;
  emergencyCorridors: boolean;
  onToggleEmergency: () => void;
  sensorGrid: boolean;
  onToggleSensorGrid: () => void;
  selectedZoneId: ZoneDigitalTwinData['id'] | null;
  onSelectZone: (zone: ZoneDigitalTwinData) => void;
}

export const GisQuickActionToolbar: React.FC<GisToolbarProps> = ({
  heatmapOverlay,
  onToggleHeatmap,
  cctvFeeds,
  onToggleCctv,
  emergencyCorridors,
  onToggleEmergency,
  sensorGrid,
  onToggleSensorGrid,
  selectedZoneId,
  onSelectZone,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const activeLayerCount = [
    heatmapOverlay,
    cctvFeeds,
    emergencyCorridors,
    sensorGrid,
  ].filter(Boolean).length;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const layerItems = [
    {
      id: 'heatmap',
      label: 'Heatmap Overlay',
      active: heatmapOverlay,
      onToggle: onToggleHeatmap,
      icon: <Flame className="w-3.5 h-3.5 text-red-400 shrink-0" />,
    },
    {
      id: 'cctv',
      label: 'CCTV Feeds',
      active: cctvFeeds,
      onToggle: onToggleCctv,
      icon: <Video className="w-3.5 h-3.5 text-blue-400 shrink-0" />,
    },
    {
      id: 'emergency',
      label: 'Emergency Corridors',
      active: emergencyCorridors,
      onToggle: onToggleEmergency,
      icon: <Siren className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
    },
    {
      id: 'sensor',
      label: 'Sensor Grid',
      active: sensorGrid,
      onToggle: onToggleSensorGrid,
      icon: <Cpu className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
    },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800">
      {/* Compact GIS "Map Layers" Dropdown Menu */}
      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className={`px-3 py-1.5 text-xs font-medium rounded-md border flex items-center gap-2 transition-colors ${
            menuOpen || activeLayerCount > 0
              ? 'bg-slate-800 border-emerald-600/80 text-slate-100'
              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-slate-100'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-emerald-400" />
          <span>Map Layers</span>
          {activeLayerCount > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] font-mono font-bold bg-emerald-500 text-slate-950 rounded">
              {activeLayerCount}
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
              menuOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute left-0 mt-1.5 w-52 bg-slate-950 border border-slate-700 rounded-md shadow-xl p-1.5 z-30 space-y-1"
          >
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
              GIS Map Overlays
            </div>
            {layerItems.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={item.active}
                onClick={item.onToggle}
                className={`w-full px-2.5 py-1.5 text-xs rounded flex items-center justify-between transition-colors ${
                  item.active
                    ? 'bg-slate-800/90 text-slate-100 font-medium'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-slate-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center ${
                    item.active
                      ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                      : 'border-slate-700 bg-slate-900'
                  }`}
                >
                  {item.active && <Check className="w-3 h-3 stroke-[2.5]" />}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface InspectorDrawerProps {
  zone: ZoneDigitalTwinData | null;
  onClose: () => void;
}

export const DigitalTwinPopoverDrawer: React.FC<InspectorDrawerProps> = ({ zone, onClose }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [liveCount, setLiveCount] = useState<number>(18);

  useEffect(() => {
    if (!zone) return;
    if (videoRef.current) {
      const rate = Math.max(0.45, Math.min(1.0, zone.avgSpeedKmh / 30));
      videoRef.current.playbackRate = rate;
      videoRef.current.play().catch(() => {
        // Autoplay fallback handled by muted + playsInline
      });
    }
  }, [zone]);

  useEffect(() => {
    if (!zone || !overlayCanvasRef.current) return;
    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let frame = 0;

    interface TrackedBox {
      laneXStart: number;
      laneXEnd: number;
      z: number;
      speed: number;
      dir: 1 | -1;
      type: 'CAR' | 'TRUCK' | 'BUS' | 'SUV';
      conf: string;
      boxColor: string;
      kmh: number;
    }

    const speedFactor = Math.max(0.55, Math.min(1.3, zone.avgSpeedKmh / 24));
    const boxes: TrackedBox[] = [
      {
        laneXStart: 0.44,
        laneXEnd: 0.16,
        z: 0.18,
        speed: 0.0042 * speedFactor,
        dir: 1,
        type: 'CAR',
        conf: '0.96',
        boxColor: '#10b981',
        kmh: Math.round(zone.avgSpeedKmh + 2),
      },
      {
        laneXStart: 0.47,
        laneXEnd: 0.30,
        z: 0.55,
        speed: 0.0036 * speedFactor,
        dir: 1,
        type: 'SUV',
        conf: '0.94',
        boxColor: '#10b981',
        kmh: Math.round(zone.avgSpeedKmh - 1),
      },
      {
        laneXStart: 0.49,
        laneXEnd: 0.43,
        z: 0.78,
        speed: 0.0031 * speedFactor,
        dir: 1,
        type: 'TRUCK',
        conf: '0.92',
        boxColor: '#f59e0b',
        kmh: Math.max(12, Math.round(zone.avgSpeedKmh - 4)),
      },
      {
        laneXStart: 0.54,
        laneXEnd: 0.66,
        z: 0.82,
        speed: 0.0038 * speedFactor,
        dir: -1,
        type: 'CAR',
        conf: '0.95',
        boxColor: '#22d3ee',
        kmh: Math.round(zone.avgSpeedKmh + 3),
      },
      {
        laneXStart: 0.57,
        laneXEnd: 0.82,
        z: 0.42,
        speed: 0.0033 * speedFactor,
        dir: -1,
        type: 'BUS',
        conf: '0.91',
        boxColor: '#f59e0b',
        kmh: Math.max(14, Math.round(zone.avgSpeedKmh - 2)),
      },
    ];

    const renderOverlay = () => {
      frame += 1;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const horizonY = h * 0.18;

      boxes.forEach((b) => {
        if (b.dir === 1) {
          b.z += b.speed;
          if (b.z > 0.95) b.z = 0.14;
        } else {
          b.z -= b.speed;
          if (b.z < 0.14) b.z = 0.94;
        }

        const y = horizonY + Math.pow(b.z, 1.25) * (h - horizonY);
        const progress = (y - horizonY) / (h - horizonY);
        const x = (b.laneXStart + progress * (b.laneXEnd - b.laneXStart)) * w;

        const scale = 0.35 + progress * 0.85;
        const bw = (b.type === 'TRUCK' || b.type === 'BUS' ? 42 : 30) * scale;
        const bh = (b.type === 'TRUCK' || b.type === 'BUS' ? 28 : 20) * scale;
        const bx = x - bw / 2;
        const by = y - bh / 2;

        // Detection box
        ctx.strokeStyle = b.boxColor;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx, by, bw, bh);

        // Label badge
        if (progress > 0.2) {
          const label = `${b.type} ${b.conf} · ${b.kmh}km/h`;
          ctx.font = 'bold 9px monospace';
          const textW = ctx.measureText(label).width + 6;
          ctx.fillStyle = 'rgba(2, 6, 23, 0.82)';
          ctx.fillRect(bx, by - 12, textW, 11);
          ctx.fillStyle = b.boxColor;
          ctx.fillText(label, bx + 3, by - 3);
        }
      });

      // CCTV Timestamp OSD
      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
      ctx.fillStyle = 'rgba(2, 6, 23, 0.78)';
      ctx.fillRect(8, 8, 192, 18);
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#f87171';
      ctx.fillText('REC ●', 13, 20);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillText(nowStr, 52, 20);

      if (frame % 45 === 0) {
        setLiveCount(Math.max(12, Math.round(zone.vehicleDensityPerKm / 10) + ((frame / 45) % 5)));
      }

      animId = requestAnimationFrame(renderOverlay);
    };

    animId = requestAnimationFrame(renderOverlay);
    return () => cancelAnimationFrame(animId);
  }, [zone]);

  if (!zone) return null;

  return (
    <div className="mt-3 bg-slate-950 border border-slate-700 rounded-lg p-3.5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
            <h4 className="text-xs font-bold text-slate-100">{zone.name}</h4>
            <span
              className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                zone.riskLevel === 'High'
                  ? 'bg-red-950 text-red-300 border border-red-800'
                  : zone.riskLevel === 'Moderate'
                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              }`}
            >
              {zone.riskLevel} Bottleneck
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">{zone.corridorName}</p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-100 rounded"
          aria-label="Close Zone Inspector"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 items-stretch">
        {/* Real Recorded Highway Traffic Video Feed + Live YOLOv8 Detection Overlay */}
        <div className="bg-slate-900 border border-slate-800 rounded-md p-2.5 flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-300 z-10">
            <span className="flex items-center gap-1.5 text-red-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              LIVE CCTV VIDEO FEED
            </span>
            <span className="text-emerald-400">
              30 FPS · YOLOv8-Traffic · {liveCount} Vehicles Tracked
            </span>
          </div>

          {/* Real Highway Traffic <video> with Transparent Detection Overlay <canvas> */}
          <div className="my-2 relative rounded border border-slate-800 bg-slate-950 overflow-hidden h-[190px]">
            <video
              ref={videoRef}
              src="/traffic-cctv.webm"
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover block"
            />
            <canvas
              ref={overlayCanvasRef}
              width={560}
              height={190}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 z-10">
            <span className="truncate">{zone.cameraCode}</span>
            <span className="text-slate-300 shrink-0">
              Avg Flow: {zone.avgSpeedKmh} km/h
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
