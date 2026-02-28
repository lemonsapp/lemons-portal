export default function StatusBadge({ status }) {
  const s = (status || "").toLowerCase();

  let cls = "badge badge--received";
  if (s.includes("prepar")) cls = "badge badge--prep";
  else if (s.includes("despach")) cls = "badge badge--sent";
  else if (s.includes("tránsito") || s.includes("transito")) cls = "badge badge--transit";
  else if (s.includes("listo")) cls = "badge badge--ready";
  else if (s.includes("entregado")) cls = "badge badge--delivered";
  else if (s.includes("recibid")) cls = "badge badge--received";

  return (
    <span className={cls}>
      <span className="dot" />
      {status}
    </span>
  );
}