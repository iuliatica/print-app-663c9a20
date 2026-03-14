import { motion } from "framer-motion";

const specs = [
  { label: "Max Print Width", value: '64"' },
  { label: "Resolution", value: "2400 DPI" },
  { label: "Color Channels", value: "12" },
  { label: "Ink Lightfastness", value: "200+ Years" },
  { label: "Color Space", value: "Adobe RGB" },
  { label: "Substrate Options", value: "18+" },
  { label: "Certification", value: "ISO 9706" },
  { label: "Inspection", value: "D50 5000K" },
];

const SpecsSection = () => {
  return (
    <section id="specs" className="py-32 px-8">
      <div className="max-w-[1400px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.19, 1, 0.22, 1] }}
          className="mb-16"
        >
          <span className="spec-label">Specifications</span>
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-[-0.03em] text-foreground mt-3">
            Technical capabilities
          </h2>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 border border-border">
          {specs.map((spec, i) => (
            <motion.div
              key={spec.label}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                duration: 0.6,
                delay: i * 0.05,
                ease: [0.19, 1, 0.22, 1],
              }}
              className="p-8 border-r border-b border-border"
            >
              <span className="spec-label">{spec.label}</span>
              <p className="font-sans text-2xl font-bold text-foreground mt-2 tabular-nums tracking-tight">
                {spec.value}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default SpecsSection;
