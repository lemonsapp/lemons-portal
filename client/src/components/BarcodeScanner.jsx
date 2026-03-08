import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function BarcodeScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(true);
  const [lastScan, setLastScan] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    BrowserMultiFormatReader.listVideoInputDevices()
      .then((devices) => {
        setCameras(devices);
        const back = devices.find(d =>
          d.label.toLowerCase().includes("back") ||
          d.label.toLowerCase().includes("trasera") ||
          d.label.toLowerCase().includes("environment")
        );
        const chosen = back || devices[0];
        if (chosen) setSelectedCamera(chosen.deviceId);
      })
      .catch(() => setError("No se pudo acceder a la cámara"));
    return () => { try { readerRef.current?.reset(); } catch {} };
  }, []);

  useEffect(() => {
    if (!selectedCamera || !videoRef.current) return;
    const reader = readerRef.current;
    let active = true;
    reader.decodeFromVideoDevice(selectedCamera, videoRef.current, (result, err) => {
      if (!active) return;
      if (result) {
        const text = result.getText();
        setLastScan(text);
        setScanning(false);
        if (navigator.vibrate) navigator.vibrate(100);
        onScan(text);
      }
    }).catch((e) => { if (active) setError("Error al iniciar cámara: " + e.message); });
    return () => { active = false; try { reader.reset(); } catch {} };
  }, [selectedCamera]);

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}>
      <div style={{ background:"#0f1b2d",border:"1px solid rgba(245,230,66,0.2)",borderRadius:16,width:"100%",maxWidth:420,overflow:"hidden" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ color:"#f5e642",fontWeight:700,fontSize:15 }}>📷 Escanear código</span>
          <button onClick={onClose} style={{ background:"transparent",border:"none",color:"rgba(255,255,255,0.5)",fontSize:18,cursor:"pointer",padding:"2px 6px" }}>✕</button>
        </div>
        {cameras.length > 1 && (
          <select style={{ display:"block",width:"calc(100% - 32px)",margin:"12px 16px 0",background:"#1a2d45",color:"#fff",border:"1px solid rgba(255,255,255,0.15)",borderRadius:8,padding:"8px 12px",fontSize:13 }}
            value={selectedCamera || ""} onChange={(e) => setSelectedCamera(e.target.value)}>
            {cameras.map((c) => <option key={c.deviceId} value={c.deviceId}>{c.label || `Cámara ${c.deviceId.slice(0,8)}`}</option>)}
          </select>
        )}
        {error && (
          <div style={{ margin:16,background:"rgba(231,76,60,0.15)",border:"1px solid rgba(231,76,60,0.3)",borderRadius:10,padding:14,color:"#e74c3c",fontSize:13 }}>
            ⚠️ {error}<br/><small>Verificá que el navegador tenga permiso para usar la cámara.</small>
          </div>
        )}
        {!error && (
          <div style={{ position:"relative",width:"100%",aspectRatio:"4/3",background:"#000",overflow:"hidden" }}>
            <video ref={videoRef} style={{ width:"100%",height:"100%",objectFit:"cover" }} />
            {scanning && (
              <div style={{ position:"absolute",bottom:12,left:0,right:0,textAlign:"center",color:"rgba(255,255,255,0.7)",fontSize:12,background:"rgba(0,0,0,0.5)",padding:"4px 0" }}>
                Apuntá al código de barras o QR
              </div>
            )}
          </div>
        )}
        {lastScan && (
          <div style={{ padding:16,borderTop:"1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ color:"rgba(255,255,255,0.6)",fontSize:12,marginBottom:6 }}>✅ Código escaneado:</div>
            <div style={{ color:"#f5e642",fontWeight:700,fontSize:16,wordBreak:"break-all",marginBottom:12,fontFamily:"monospace" }}>{lastScan}</div>
            <div style={{ display:"flex",gap:10 }}>
              <button onClick={() => { setLastScan(null); setScanning(true); }}
                style={{ flex:1,background:"transparent",border:"1px solid rgba(255,255,255,0.2)",color:"#fff",borderRadius:8,padding:"9px 0",fontSize:13,cursor:"pointer" }}>
                Escanear otro
              </button>
              <button onClick={() => { onScan(lastScan); onClose(); }}
                style={{ flex:1,background:"#f5e642",border:"none",color:"#0f1b2d",borderRadius:8,padding:"9px 0",fontSize:13,fontWeight:700,cursor:"pointer" }}>
                Usar este
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
