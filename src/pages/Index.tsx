import CropMarks from "@/components/CropMarks";
import Navigation from "@/components/Navigation";
import HeroSection from "@/components/HeroSection";
import CollectionSection from "@/components/CollectionSection";
import ProcessSection from "@/components/ProcessSection";
import SpecsSection from "@/components/SpecsSection";
import FooterSection from "@/components/FooterSection";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <CropMarks />
      <Navigation />
      <HeroSection />
      <CollectionSection />
      <ProcessSection />
      <SpecsSection />
      <FooterSection />
    </div>
  );
};

export default Index;
