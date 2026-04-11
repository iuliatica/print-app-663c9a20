import logoPrintica from "@/assets/logo-printica.png";

const BrandLogo = () => (
  <img src={typeof logoPrintica === 'string' ? logoPrintica : (logoPrintica as any).src ?? logoPrintica} alt="Printica" className="h-10 w-auto" />
);

export default BrandLogo;
