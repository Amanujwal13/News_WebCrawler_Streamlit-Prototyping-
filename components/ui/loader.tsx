import React from "react";
import { motion } from "motion/react";

export interface LoaderOneProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  color?: string;
}

export const LoaderOne: React.FC<LoaderOneProps> = ({
  className = "",
  size = "md",
  color = "currentColor",
}) => {
  const sizeMap = {
    sm: "w-1.5 h-1.5",
    md: "w-2.5 h-2.5",
    lg: "w-3.5 h-3.5",
  };

  const gapMap = {
    sm: "gap-1",
    md: "gap-1.5",
    lg: "gap-2",
  };

  return (
    <div className={`inline-flex items-center justify-center ${gapMap[size]} ${className}`}>
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className={`${sizeMap[size]} rounded-full block`}
          style={{ backgroundColor: color }}
          animate={{
            y: ["0%", "-60%", "0%"],
            scale: [1, 1.2, 1],
            opacity: [0.6, 1, 0.6],
          }}
          transition={{
            duration: 0.75,
            repeat: Infinity,
            repeatType: "loop",
            delay: index * 0.18,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
};

export function LoaderOneDemo() {
  return <LoaderOne />;
}

export default LoaderOne;
