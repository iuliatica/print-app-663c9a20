import { motion } from "framer-motion";

const steps = [
  {
    number: "01",
    title: "Upload",
    description:
      "Drag your file into our secure uploader. We accept TIFF, PSD, and high-resolution JPEG. Real-time resolution verification ensures your file meets archival print standards.",
  },
  {
    number: "02",
    title: "Profile",
    description:
      "We generate a custom ICC profile matched to your chosen substrate. Soft-proofing is provided so you can verify tonal accuracy before committing to print.",
  },
  {
    number: "03",
    title: "Print",
    description:
      "Printed on calibrated 12-color pigment printers using archival inks rated for 200+ year lightfastness. Each print is hand-inspected under D50 lighting.",
  },
  {
    number: "04",
    title: "Ship",
    description:
      "Flat-packed between acid-free tissue in a rigid mailer. Climate-controlled shipping available for international orders. White-glove delivery for prints over 40×60\".",
  },
];

const ProcessSection = () => {
  return (
    <section id="process" className="py-32 px-8 bg-card border-t border-b border-border">
      <div className="max-w-[1400px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.19, 1, 0.22, 1] }}
          className="mb-16"
        >
          <span className="spec-label">Process</span>
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-[-0.03em] text-foreground mt-3">
            From file to frame
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-0">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                duration: 0.6,
                delay: i * 0.1,
                ease: [0.19, 1, 0.22, 1],
              }}
              className="p-8 border-r border-border last:border-r-0"
            >
              <span className="font-sans text-sm text-primary font-semibold tabular-nums">
                {step.number}
              </span>
              <h3 className="font-display font-bold text-xl tracking-[-0.02em] text-foreground mt-2">
                {step.title}
              </h3>
              <p className="font-sans text-sm text-muted-foreground mt-4 leading-relaxed">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProcessSection;
