// AnimatedBadge.jsx — Badges especiales con animaciones CSS

const EFFECTS = {
  lightning: {
    css: `
      @keyframes lightning {
        0%,100%{box-shadow:0 0 8px #f5e03a,0 0 20px #f5e03a,0 0 40px rgba(245,224,58,.4)}
        50%{box-shadow:0 0 4px #f5e03a,0 0 8px #f5e03a,0 0 12px rgba(245,224,58,.2)}
      }
      @keyframes textflicker {
        0%,100%{opacity:1} 92%{opacity:1} 93%{opacity:.4} 95%{opacity:1} 97%{opacity:.6} 99%{opacity:1}
      }
    `,
    badgeStyle: (color) => ({
      animation: "lightning 1.5s ease-in-out infinite",
      background: `linear-gradient(135deg,${color}22,${color}08)`,
      border: `1px solid ${color}60`,
    }),
    textStyle: { animation: "textflicker 4s linear infinite" },
  },
  shield: {
    css: `
      @keyframes shieldpulse {
        0%,100%{box-shadow:0 0 0 0 rgba(96,165,250,0)}
        50%{box-shadow:0 0 0 6px rgba(96,165,250,.15)}
      }
      @keyframes shieldspin {
        from{transform:rotate(0deg)} to{transform:rotate(360deg)}
      }
    `,
    badgeStyle: (color) => ({
      animation: "shieldpulse 2s ease-in-out infinite",
      background: `linear-gradient(135deg,${color}20,${color}08)`,
      border: `1px solid ${color}50`,
    }),
    textStyle: {},
    emojiStyle: { display:"inline-block" },
  },
  pulse: {
    css: `
      @keyframes botpulse {
        0%,100%{box-shadow:0 0 0 0 rgba(167,139,250,0),0 0 8px rgba(167,139,250,.3)}
        50%{box-shadow:0 0 0 4px rgba(167,139,250,.1),0 0 16px rgba(167,139,250,.5)}
      }
      @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
    `,
    badgeStyle: (color) => ({
      animation: "botpulse 1.8s ease-in-out infinite",
      background: `linear-gradient(135deg,${color}18,${color}06)`,
      border: `1px solid ${color}40`,
    }),
    textStyle: {},
    emojiStyle: { animation: "blink 2s step-start infinite" },
  },
  glow: {
    css: `
      @keyframes betaflow {
        0%{background-position:0% 50%}
        50%{background-position:100% 50%}
        100%{background-position:0% 50%}
      }
      @keyframes betaglow {
        0%,100%{box-shadow:0 0 8px rgba(34,197,94,.4),0 0 16px rgba(34,197,94,.2)}
        50%{box-shadow:0 0 16px rgba(34,197,94,.7),0 0 32px rgba(34,197,94,.3)}
      }
    `,
    badgeStyle: (color) => ({
      animation: "betaglow 2s ease-in-out infinite",
      background: "linear-gradient(270deg,#22c55e22,#16a34a18,#22c55e22)",
      backgroundSize: "200% 200%",
      border: "1px solid #22c55e50",
    }),
    textStyle: { color: "#4ade80" },
  },
  sparkle: {
    css: `
      @keyframes sparkle {
        0%,100%{box-shadow:0 0 8px #f5e03a60,0 0 20px #f5e03a30}
        33%{box-shadow:0 0 12px #ff620060,0 0 24px #ff620030}
        66%{box-shadow:0 0 10px #f5e03a80,0 0 22px #f5e03a40}
      }
      @keyframes sparklespin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
    `,
    badgeStyle: () => ({
      animation: "sparkle 2.5s ease-in-out infinite",
      background: "linear-gradient(135deg,rgba(245,224,58,.15),rgba(255,98,0,.1))",
      border: "1px solid rgba(245,224,58,.45)",
    }),
    textStyle: { background:"linear-gradient(90deg,#f5e03a,#ff6200,#f5e03a)",backgroundClip:"text",WebkitBackgroundClip:"text",color:"transparent" },
    emojiStyle: { display:"inline-block", animation:"sparklespin 4s linear infinite" },
  },
  float: {
    css: `
      @keyframes float {
        0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)}
      }
      @keyframes floatglow {
        0%,100%{box-shadow:0 0 6px rgba(129,140,248,.3)} 50%{box-shadow:0 0 14px rgba(129,140,248,.6)}
      }
    `,
    badgeStyle: (color) => ({
      animation: "float 3s ease-in-out infinite, floatglow 3s ease-in-out infinite",
      background: `${color}15`,
      border: `1px solid ${color}40`,
    }),
    textStyle: {},
  },
  spin: {
    css: `
      @keyframes starspin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
      @keyframes starglow {
        0%,100%{box-shadow:0 0 10px #f5e03a60} 50%{box-shadow:0 0 20px #f5e03a90,0 0 40px #f5e03a30}
      }
    `,
    badgeStyle: () => ({
      animation: "starglow 2s ease-in-out infinite",
      background: "rgba(245,224,58,.1)",
      border: "1px solid rgba(245,224,58,.4)",
    }),
    textStyle: {},
    emojiStyle: { display:"inline-block", animation:"starspin 6s linear infinite" },
  },
};

export function AnimatedBadge({ badge, size = "normal" }) {
  const data   = badge.data || {};
  const effect = data.effect || "pulse";
  const color  = data.color || "#f5e03a";
  const fx     = EFFECTS[effect] || EFFECTS.pulse;

  const isSmall = size === "small";
  const pad  = isSmall ? "3px 10px" : "5px 14px";
  const fs   = isSmall ? 9 : 10;
  const efs  = isSmall ? 12 : 14;

  return (
    <>
      <style>{fx.css}</style>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: isSmall ? 5 : 7,
        padding: pad, borderRadius: 100,
        fontFamily: "'DM Mono', monospace",
        fontSize: fs, letterSpacing: "1.5px", textTransform: "uppercase",
        cursor: "default", userSelect: "none",
        position: "relative",
        ...fx.badgeStyle(color),
      }}>
        <span style={{ fontSize: efs, ...(fx.emojiStyle||{}) }}>{badge.emoji}</span>
        <span style={{ color, fontWeight: 600, ...fx.textStyle }}>{badge.name}</span>
      </div>
    </>
  );
}

export function BadgeRow({ badges, allItems, size = "normal" }) {
  return (
    <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
      {badges.map(bk => {
        const b = allItems.find(i => i.key === bk);
        if (!b) return null;
        const data = b.data || {};
        if (data.animated) {
          return <AnimatedBadge key={bk} badge={b} size={size} />;
        }
        const color = data.color || "#f5e03a";
        return (
          <div key={bk} style={{
            fontFamily:"'DM Mono',monospace", fontSize:size==="small"?9:10,
            letterSpacing:"1.5px", textTransform:"uppercase",
            padding:size==="small"?"3px 10px":"5px 14px", borderRadius:100,
            background:color+"15", border:"1px solid "+color+"30", color,
            display:"flex", alignItems:"center", gap:5,
          }}>
            <span style={{ fontSize:size==="small"?11:13 }}>{b.emoji}</span>
            {b.name}
          </div>
        );
      })}
    </div>
  );
}
