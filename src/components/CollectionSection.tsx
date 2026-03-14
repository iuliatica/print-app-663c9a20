import { motion } from "framer-motion";
import inkMacro from "@/assets/ink-macro.jpg";
import paperTexture from "@/assets/paper-texture-2.jpg";
import heroMacro from "@/assets/hero-paper-macro.jpg";

const papers = [
  {
    name: "Hahnemühle Photo Rag",
    gsm: "308",
    finish: "Matte",
    material: "100% Cotton",
    ink: "Pigment",
    image: heroMacro,
  },
  {
    name: "Canson Platine Fibre Rag",
    gsm: "310",
    finish: "Satin",
    material: "100% Cotton",
    ink: "Pigment",
    image: inkMacro,
  },
  {
    name: "Awagami Unryu",
    gsm: "55",
    finish: "Textured",
    material: "Kozo + Pulp",
    ink: "Dye / Pigment",
    image: paperTexture,
  },
];

const stagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.12,
    },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.19, 1, 0.22, 1] } },
};

const CollectionSection = () => {
  return (
    <section id="collection" className="py-32 px-8">
      <div className="max-w-[1400px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.19, 1, 0.22, 1] }}
          className="mb-16"
        >
          <span className="spec-label">The Collection</span>
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-[-0.03em] text-foreground mt-3">
            Substrates
          </h2>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-border"
        >
          {papers.map((paper) => (
            <motion.div
              key={paper.name}
              variants={fadeUp}
              className="border-r border-b border-border last:border-r-0 group cursor-pointer"
            >
              {/* Image */}
              <div className="aspect-[4/3] overflow-hidden bg-secondary">
                <img
                  src={paper.image}
                  alt={`${paper.name} paper texture macro`}
                  className="w-full h-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.19,1,0.22,1)] group-hover:scale-[1.03]"
                />
              </div>

              {/* Specs */}
              <div className="p-8">
                <h3 className="font-display font-bold text-lg tracking-[-0.02em] text-foreground">
                  {paper.name}
                </h3>

                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div>
                    <span className="spec-label">Weight</span>
                    <p className="font-sans text-sm text-foreground mt-1 tabular-nums">
                      {paper.gsm} GSM
                    </p>
                  </div>
                  <div>
                    <span className="spec-label">Finish</span>
                    <p className="font-sans text-sm text-foreground mt-1">
                      {paper.finish}
                    </p>
                  </div>
                  <div>
                    <span className="spec-label">Material</span>
                    <p className="font-sans text-sm text-foreground mt-1">
                      {paper.material}
                    </p>
                  </div>
                  <div>
                    <span className="spec-label">Ink Type</span>
                    <p className="font-sans text-sm text-foreground mt-1">
                      {paper.ink}
                    </p>
                  </div>
                </div>

                <button className="mt-8 h-10 px-6 w-full border border-foreground bg-transparent text-foreground font-sans text-sm font-semibold tracking-tight hover:bg-foreground hover:text-background transition-colors duration-200 active:translate-y-[1px]">
                  Configure Print
                </button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default CollectionSection;
