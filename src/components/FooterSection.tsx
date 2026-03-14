const FooterSection = () => {
  return (
    <footer className="py-16 px-8 border-t border-border">
      <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        <div>
          <span className="font-display text-lg font-bold tracking-[-0.03em] text-foreground">
            Grain & Gutter
          </span>
          <p className="font-sans text-sm text-muted-foreground mt-2">
            Archival printing for the digital vanguard.
          </p>
        </div>

        <div className="flex items-center gap-8">
          <a href="#" className="spec-label hover:text-foreground transition-colors duration-200">
            Terms
          </a>
          <a href="#" className="spec-label hover:text-foreground transition-colors duration-200">
            Privacy
          </a>
          <a href="#" className="spec-label hover:text-foreground transition-colors duration-200">
            Contact
          </a>
        </div>

        <p className="font-sans text-xs text-muted-foreground tabular-nums">
          © 2026 Grain & Gutter. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default FooterSection;
