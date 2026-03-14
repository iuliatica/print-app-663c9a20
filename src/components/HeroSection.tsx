import { motion } from "framer-motion";
import heroImage from "@/assets/hero-paper-macro.jpg";

const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-end pb-32 pt-48 px-8 overflow-hidden">
      {/* Hero background image */}
      <div className="absolute inset-0 z-0">
        <img
          src={heroImage}
          alt="Macro detail of archival cotton paper fibers"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-background/70" />
      </div>

      <div className="relative z-10 w-full max-w-[1400px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          {/* Left metadata column */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.19, 1, 0.22, 1] }}
            className="md:col-span-4 flex flex-col gap-6"
          >
            <div>
              <span className="spec-label">Service</span>
              <p className="font-sans text-sm text-foreground mt-1">
                Large-format archival printing
              </p>
            </div>
            <div>
              <span className="spec-label">For</span>
              <p className="font-sans text-sm text-foreground mt-1">
                Architects · Gallery Owners · Photographers
              </p>
            </div>
            <div>
              <span className="spec-label">Standards</span>
              <p className="font-sans text-sm text-foreground mt-1 tabular-nums">
                ISO 9706 · ICC Profile Matched · Acid-free
              </p>
            </div>
          </motion.div>

          {/* Right headline */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease: [0.19, 1, 0.22, 1] }}
            className="md:col-span-8"
          >
            <h1 className="font-display font-bold text-[clamp(2.5rem,8vw,4.5rem)] leading-[1.05] tracking-[-0.03em] text-foreground">
              Archival standards
              <br />
              for the digital
              <br />
              vanguard.
            </h1>
            <p className="mt-8 font-sans text-lg text-muted-foreground max-w-[50ch] leading-relaxed">
              Museum-grade printing on the world's finest substrates. Every
              print is ICC profiled, hand-inspected, and built to outlast
              the century.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
