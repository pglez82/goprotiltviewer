import { useState, useRef } from "react";

const loadGpmfExtract = async () => {
  const module = await import("gpmf-extract");
  return module.default ?? module.GPMFExtract ?? module;
};

const loadGoproTelemetry = async () => {
  const module = await import("gopro-telemetry");
  return module.default ?? module;
};

export default function App() {
  const [videoSrc, setVideoSrc] = useState(null);
  const [samples, setSamples] = useState([]);
  const [currentTilt, setCurrentTilt] = useState(0);
  const [status, setStatus] = useState("Idle");
  const videoRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    
    // Create local URL for the video player
    setVideoSrc(URL.createObjectURL(file));
    setStatus("Extracting telemetry...");

    try {
      const GPMFExtract = await loadGpmfExtract();
      const goproTelemetry = await loadGoproTelemetry();

      const extracted = await GPMFExtract(file, { browserMode: true });
      const telemetry = await goproTelemetry(
        { rawData: extracted.rawData, timing: extracted.timing },
        { stream: ["ACCL"], repeatSticky: true }
      );

      // Accessing samples path confirmed by imagen.jpg
      const acclSamples = telemetry[1]?.streams?.ACCL?.samples;

      if (!acclSamples) {
        setStatus("No ACCL data found");
        return;
      }

      // Pre-calculate tilt for all samples to make playback smooth
      const processed = acclSamples.map(s => {
        const [x, y, z] = s.value;
        // Pitch/Tilt formula: atan2(-x, sqrt(y^2 + z^2))
        const tilt = Math.atan2(-x, Math.sqrt(y ** 2 + z ** 2)) * (180 / Math.PI);
        return {
          time: s.cts / 1000, // Convert ms to seconds
          tilt: tilt
        };
      });

      setSamples(processed);
      setStatus("Ready to play");
    } catch (err) {
      console.error(err);
      setStatus("Error loading file");
    }
  };

  // This runs every time the video moves (smoothly updates the UI)
  const handleTimeUpdate = () => {
    if (!videoRef.current || samples.length === 0) return;

    const currentTime = videoRef.current.currentTime;
    
    // Find the sample closest to the current video time
    const closestSample = samples.find(s => s.time >= currentTime);
    
    if (closestSample) {
      setCurrentTilt(closestSample.tilt);
    }
  };

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif", maxWidth: "800px" }}>
      <h2>GoPro Live Tilt Viewer</h2>
      
      <input 
        type="file" 
        accept="video/*" 
        onChange={(e) => handleFile(e.target.files[0])} 
      />
      <p>Status: {status}</p>

      {videoSrc && (
        <div style={{ marginTop: 20 }}>
          <div style={{ position: "relative", width: "100%", borderRadius: "8px", overflow: "hidden" }}>
            <video 
              ref={videoRef}
              src={videoSrc} 
              controls 
              onTimeUpdate={handleTimeUpdate}
              style={{ width: "100%", display: "block" }}
            />
            <div style={{ 
              position: "absolute",
              top: currentTilt < -90 
                ? "50%" 
                : currentTilt > -60 
                  ? "0%" 
                  : `${50 - ((currentTilt + 90) / 30) * 50}%`,
              left: 0,
              width: "100%",
              height: "2px",
              backgroundColor: "red",
              pointerEvents: "none",
              opacity: 0.7
            }} />
          </div>

          <div style={{ 
            marginTop: 20, 
            padding: "20px", 
            background: "#222", 
            color: "#00ff00", 
            textAlign: "center",
            borderRadius: "8px",
            fontSize: "2rem"
          }}>
            TILT: {currentTilt.toFixed(2)}°
          </div>
        </div>
      )}
    </div>
  );
}