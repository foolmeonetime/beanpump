"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ImageGalleryProps {
  onImageSelect: (imageUrl: string) => void;
}

const SAMPLE_IMAGES = [
  "🟠", "🔵", "🟢", "🟡", "🟣", "🔴", "⚫", "⚪",
  "🍎", "🍊", "🍋", "🍌", "🍇", "🍓", "🥝", "🍑",
  "🚀", "⭐", "💎", "🔥", "⚡", "🌟", "✨", "💰",
  "🎯", "🏆", "🎨", "🎭", "🎪", "🎡", "🎢", "🎠"
];

export function ImageGallery({ onImageSelect }: ImageGalleryProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectEmoji = (emoji: string) => {
    // Create a simple colored circle with emoji for demo
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // Gradient background
      const gradient = ctx.createLinearGradient(0, 0, 200, 200);
      gradient.addColorStop(0, '#8B5CF6');
      gradient.addColorStop(1, '#EC4899');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(100, 100, 100, 0, 2 * Math.PI);
      ctx.fill();
      
      // Add emoji
      ctx.font = '80px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, 100, 100);
      
      const dataUrl = canvas.toDataURL();
      onImageSelect(dataUrl);
      setIsOpen(false);
    }
  };

  if (!isOpen) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="w-full"
      >
        🎨 Or Choose from Templates
      </Button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-medium">Quick Templates</h4>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(false)}
        >
          ✕
        </Button>
      </div>
      
      <div className="grid grid-cols-8 gap-2">
        {SAMPLE_IMAGES.map((emoji, index) => (
          <button
            key={index}
            type="button"
            onClick={() => selectEmoji(emoji)}
            className="w-10 h-10 rounded-lg border hover:border-purple-300 hover:bg-purple-50 transition-colors flex items-center justify-center text-lg"
          >
            {emoji}
          </button>
        ))}
      </div>
      
      <p className="text-xs text-gray-500">
        Click any icon to create a token image template
      </p>
    </div>
  );
}