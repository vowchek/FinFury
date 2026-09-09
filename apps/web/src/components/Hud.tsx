/** HUD-рамка с неоновыми уголками — общий элемент «приборной панели». */
export function Hud({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`hud ${className}`}>
      <span className="hud-corner tl" aria-hidden="true" />
      <span className="hud-corner tr" aria-hidden="true" />
      <span className="hud-corner bl" aria-hidden="true" />
      <span className="hud-corner br" aria-hidden="true" />
      {children}
    </div>
  );
}

/** Моноширинная HUD-метка вида `// system.tag`. */
export function HudTag({ children }: { children: string }) {
  return (
    <p className="font-mono text-xs tracking-tight text-cyber/80">
      <span className="text-mute">//</span> {children}
    </p>
  );
}