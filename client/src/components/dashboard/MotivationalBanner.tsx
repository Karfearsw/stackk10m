import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

import banner1 from "@assets/d199ae88-7727-4c89-9b40-70b0d779ba41_1764244434725.png";
import banner2 from "@assets/14cd99f0-0520-461a-9bab-2ef4d575e651 (1)_1764244434726.png";
import banner3 from "@assets/fac383a9-5eb3-4f1f-879e-5a8035b6d3c7 (1)_1764244434728.png";
import banner4 from "@assets/3963cd8c (1)_1764244434728.png";
import banner5 from "@assets/b8ea7ed5-2ba5-44b1-a73d-b1b73ea26b3d (1)_1764244434728.png";
import banner6 from "@assets/9402bce5-3c31-480a-b204-8a0d501032c7 (1)_1764244434729.png";
import banner7 from "@assets/a9abe541-7697-4dd5-8a56-3445face39e4_1764244434729.png";

const bannerImages = [banner1, banner2, banner3, banner4, banner5, banner6, banner7];

const motivationalQuotes = [
  { quote: "Every property has a story. Make yours a success.", author: "Real Estate Wisdom" },
  { quote: "The best investment on Earth is earth.", author: "Louis Glickman" },
  { quote: "Don't wait to buy real estate. Buy real estate and wait.", author: "Will Rogers" },
  { quote: "Real estate cannot be lost or stolen, nor can it be carried away.", author: "Franklin D. Roosevelt" },
  { quote: "In real estate, you make 10% of your money in your craft and 90% in your mindset.", author: "Grant Cardone" },
  { quote: "Success in real estate comes down to two factors: location and determination.", author: "Barbara Corcoran" },
  { quote: "Ninety percent of all millionaires become so through owning real estate.", author: "Andrew Carnegie" },
  { quote: "The major fortunes in America have been made in land.", author: "John D. Rockefeller" },
  { quote: "Real estate investing, even on a very small scale, remains a tried and true means of building wealth.", author: "Robert Kiyosaki" },
  { quote: "Landlords grow rich in their sleep.", author: "John Stuart Mill" },
  { quote: "Flip, Stackk, Win! Transform every lead into a deal.", author: "FlipStackk" },
  { quote: "Your hustle determines your results. Stack those wins!", author: "FlipStackk" },
];

export function MotivationalBanner() {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [currentQuoteIndex, setCurrentQuoteIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    const imageInterval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentImageIndex((prev) => (prev + 1) % bannerImages.length);
        setIsTransitioning(false);
      }, 500);
    }, 6000);

    return () => clearInterval(imageInterval);
  }, []);

  useEffect(() => {
    const quoteInterval = setInterval(() => {
      setCurrentQuoteIndex((prev) => (prev + 1) % motivationalQuotes.length);
    }, 8000);

    return () => clearInterval(quoteInterval);
  }, []);

  const goToPrevious = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentImageIndex((prev) => (prev - 1 + bannerImages.length) % bannerImages.length);
      setIsTransitioning(false);
    }, 300);
  };

  const goToNext = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentImageIndex((prev) => (prev + 1) % bannerImages.length);
      setIsTransitioning(false);
    }, 300);
  };

  const currentQuote = motivationalQuotes[currentQuoteIndex];

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-black via-gray-900 to-black mb-6" data-testid="motivational-banner">
      <div className="relative h-48 md:h-56 lg:h-64 overflow-hidden">
        <div
          className={`absolute inset-0 transition-opacity duration-500 ${isTransitioning ? "opacity-0" : "opacity-100"}`}
        >
          <img
            src={bannerImages[currentImageIndex]}
            alt="Motivational banner"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
          <div className="max-w-3xl">
            <p 
              className="text-white text-lg md:text-xl lg:text-2xl font-semibold italic leading-relaxed transition-all duration-500"
              key={currentQuoteIndex}
            >
              "{currentQuote.quote}"
            </p>
            <p className="text-white/70 text-sm md:text-base mt-2">
              — {currentQuote.author}
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full h-10 w-10"
          onClick={goToPrevious}
          data-testid="banner-prev"
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full h-10 w-10"
          onClick={goToNext}
          data-testid="banner-next"
        >
          <ChevronRight className="h-6 w-6" />
        </Button>

        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
          {bannerImages.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                setIsTransitioning(true);
                setTimeout(() => {
                  setCurrentImageIndex(index);
                  setIsTransitioning(false);
                }, 300);
              }}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                index === currentImageIndex
                  ? "bg-primary w-6"
                  : "bg-white/50 hover:bg-white/70"
              }`}
              data-testid={`banner-dot-${index}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
