import Navbar from '../components/landingpage/Navbar';
import Hero from '../components/landingpage/Hero';
import Features from '../components/landingpage/Features';
import HowItWorks from '../components/landingpage/HowItWorks';
import CTASection from '../components/landingpage/CTASection';
import Footer from '../components/landingpage/Footer';

function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <CTASection />
      </main>
      <Footer />
    </>
  );
}

export default LandingPage;