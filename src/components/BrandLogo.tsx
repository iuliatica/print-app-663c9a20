import logoPrintica from "@/assets/logo-printica.png";

const BrandLogo = () => {
  const src = typeof logoPrintica === "string" ? logoPrintica : (logoPrintica as { src: string }).src;
  return <img src={src} alt="Printica" className="h-10 w-auto" />;
};

export default BrandLogo;
