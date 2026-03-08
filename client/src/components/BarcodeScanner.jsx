import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function BarcodeScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const [error, setError] = useState(null);
  const [lastScan, setLastScan] = useState(null);

  useEffect(() => {
    let active = true;
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    async function start() {
      try {
        // Pedir permiso y obtener stream directamente
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } }
        });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        // Escanear desde el video
        reader.decodeFromVideoElement(videoRef.current, (result, err) => {
          if (!active) return;
          if (result) {
            const text = result.getText();
            setLastScan(text);
            if (navigator.vibrate) navigator.vibrate(100);
            onScan(text);
          }
        });
      } catch (e) {
        if (active) setError("No se pudo acceder a la cámara: " + e.message);
      }
    }

    start();

    return () => {
      active = false;
      try { readerRef.current?.reset(); } catch {}
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}>
      <div style={{ background:"#0f1b2d",border:"1px solid rgba(245,230,66,0.2)",borderRadius:16,width:"100%",maxWidth:420,overflow:"hidden" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ color:"#f5e642",fontWeight:700,fontSize:15 }}>📷 Escanear código</span>
          <button onClick={onClose} style={{ background:"transparent",border:"none",color:"rgba(255,255,255,0.5)",fontSize:18,cursor:"pointer",padding:"2px 6px" }}>✕</button>
        </div>

        {error ? (
          <div style={{ margin:16,background:"rgba(231,76,60,0.15)",border:"1px solid rgba(231,76,60,0.3)",borderRadius:10,padding:14,color:"#e74c3c",fontSize:13 }}>
            ⚠️ {error}
          </div>
        ) : (
          <div style={{ position:"relative",width:"100%",aspectRatio:"4/3",background:"#000",overflow:"hidden" }}>
            <video ref={videoRef} muted playsInline style={{ width:"100%",height:"100%",objectFit:"cover" }} />
            <div style={{ position:"absolute",bottom:12,left:0,right:0,textAlign:"center",color:"rgba(255,255,255,0.7)",fontSize:12,background:"rgba(0,0,0,0.5)",padding:"4px 0" }}>
              Apuntá al código de barras o QR
            </div>
          </div>
        )}

        {lastScan && (
          <div style={{ padding:16,borderTop:"1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ color:"rgba(255,255,255,0.6)",fontSize:12,marginBottom:6 }}>✅ Escaneado:</div>
            <div style={{ color:"#f5e642",fontWeight:700,fontSize:15,wordBreak:"break-all",marginBottom:12,fontFamily:"monospace" }}>{lastScan}</div>
            <div style={{ display:"flex",gap:10 }}>
              <button onClick={() => setLastScan(null)} style={{ flex:1,background:"transparent",border:"1px solid rgba(255,255,255,0.2)",color:"#fff",borderRadius:8,padding:"9px 0",fontSize:13,cursor:"pointer" }}>Escanear otro</button>
              <button onClick={() => { onScan(lastScan); onClose(); }} style={{ flex:1,background:"#f5e642",border:"none",color:"#0f1b2d",borderRadius:8,padding:"9px 0",fontSize:13,fontWeight:700,cursor:"pointer" }}>Usar este</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
