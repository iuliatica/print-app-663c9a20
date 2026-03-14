import { motion } from "framer-motion";

const Navigation = () => {
  return (
    <motion.nav
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
      className="fixed top-0 left-0 right-0 z-40 px-8 py-6 flex items-center justify-between bg-background/95 backdrop-blur-none border-b border-border"
    >
      <div className="flex items-center gap-2">
        <span className="font-display text-xl font-bold tracking-[-0.03em] text-foreground">
          Grain & Gutter
        </span>
      </div>

      <div className="hidden md:flex items-center gap-8">
        <a href="#collection" className="spec-label hover:text-foreground transition-colors duration-200">
          The Collection
        </a>
        <a href="#process" className="spec-label hover:text-foreground transition-colors duration-200">
          Process
        </a>
        <a href="#specs" className="spec-label hover:text-foreground transition-colors duration-200">
          Specifications
        </a>
      </div>

      <button className="h-10 px-6 border border-foreground bg-transparent text-foreground font-sans text-sm font-semibold tracking-tight hover:bg-foreground hover:text-background transition-colors duration-200 active:translate-y-[1px] active:shadow-none">
        Start a Print
      </button>
    </motion.nav>
  );
};

export default Navigation;
