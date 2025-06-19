import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"

interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  value?: number
  max?: number
  showPercentage?: boolean
  variant?: "default" | "success" | "warning" | "danger"
  size?: "sm" | "md" | "lg"
  animated?: boolean
  label?: string
}

const progressVariants = {
  default: "bg-primary",
  success: "bg-green-500",
  warning: "bg-yellow-500", 
  danger: "bg-red-500"
}

const sizeVariants = {
  sm: "h-2",
  md: "h-3", 
  lg: "h-4"
}

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ 
  className, 
  value = 0, 
  max = 100,
  showPercentage = false,
  variant = "default",
  size = "md",
  animated = true,
  label,
  ...props 
}, ref) => {
  const percentage = Math.min((value / max) * 100, 100)
  const isComplete = percentage >= 100

  return (
    <div className="w-full space-y-2">
      {(label || showPercentage) && (
        <div className="flex justify-between items-center">
          {label && (
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {label}
            </span>
          )}
          {showPercentage && (
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {percentage.toFixed(1)}%
            </span>
          )}
        </div>
      )}
      
      <ProgressPrimitive.Root
        ref={ref}
        className={cn(
          "relative w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800",
          sizeVariants[size],
          className
        )}
        {...props}
      >
        <ProgressPrimitive.Indicator
          asChild
          style={{
            transform: `translateX(-${100 - percentage}%)`,
          }}
        >
          <motion.div
            className={cn(
              "h-full w-full flex-1 rounded-full transition-all relative overflow-hidden",
              progressVariants[variant],
              isComplete && "bg-green-500"
            )}
            initial={animated ? { x: "-100%" } : undefined}
            animate={animated ? { x: `${percentage - 100}%` } : undefined}
            transition={animated ? { 
              duration: 1, 
              ease: "easeOut",
              delay: 0.2 
            } : undefined}
          >
            {/* Shimmer effect for animated progress */}
            {animated && (
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  repeatDelay: 2,
                  ease: "easeInOut"
                }}
              />
            )}
          </motion.div>
        </ProgressPrimitive.Indicator>
        
        {/* Completion glow effect */}
        {isComplete && animated && (
          <motion.div
            className="absolute inset-0 rounded-full bg-green-400/50"
            initial={{ scale: 1, opacity: 0 }}
            animate={{ 
              scale: [1, 1.1, 1], 
              opacity: [0, 0.6, 0] 
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              repeatDelay: 1
            }}
          />
        )}
      </ProgressPrimitive.Root>
    </div>
  )
})

Progress.displayName = ProgressPrimitive.Root.displayName

// Circular progress variant
interface CircularProgressProps {
  value: number
  max?: number
  size?: number
  strokeWidth?: number
  variant?: "default" | "success" | "warning" | "danger"
  showPercentage?: boolean
  label?: string
  className?: string
}

const CircularProgress = React.forwardRef<
  SVGSVGElement,
  CircularProgressProps
>(({
  value = 0,
  max = 100,
  size = 120,
  strokeWidth = 8,
  variant = "default",
  showPercentage = true,
  label,
  className
}, ref) => {
  const percentage = Math.min((value / max) * 100, 100)
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const strokeDasharray = circumference
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  const colorMap = {
    default: "#3b82f6",
    success: "#22c55e", 
    warning: "#f59e0b",
    danger: "#ef4444"
  }

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg
        ref={ref}
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-gray-200 dark:text-gray-700"
        />
        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colorMap[variant]}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={strokeDasharray}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </svg>
      
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {showPercentage && (
          <motion.span 
            className="text-2xl font-bold text-gray-900 dark:text-white"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5, duration: 0.3 }}
          >
            {percentage.toFixed(0)}%
          </motion.span>
        )}
        {label && (
          <span className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {label}
          </span>
        )}
      </div>
    </div>
  )
})

CircularProgress.displayName = "CircularProgress"

// Multi-step progress indicator
interface StepProgressProps {
  steps: Array<{
    id: string
    label: string
    description?: string
  }>
  currentStep: number
  variant?: "default" | "success" | "warning" | "danger"
  orientation?: "horizontal" | "vertical"
  className?: string
}

const StepProgress = React.forwardRef<
  HTMLDivElement,
  StepProgressProps
>(({
  steps,
  currentStep,
  variant = "default",
  orientation = "horizontal",
  className
}, ref) => {
  const isHorizontal = orientation === "horizontal"
  
  return (
    <div 
      ref={ref}
      className={cn(
        "flex",
        isHorizontal ? "items-center space-x-4" : "flex-col space-y-4",
        className
      )}
    >
      {steps.map((step, index) => {
        const isCompleted = index < currentStep
        const isCurrent = index === currentStep
        const isUpcoming = index > currentStep
        
        return (
          <div
            key={step.id}
            className={cn(
              "flex items-center",
              !isHorizontal && "w-full"
            )}
          >
            {/* Step indicator */}
            <div className="flex items-center">
              <motion.div
                className={cn(
                  "relative flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors",
                  isCompleted && "bg-green-500 border-green-500 text-white",
                  isCurrent && `border-${variant === "default" ? "blue" : variant}-500 text-${variant === "default" ? "blue" : variant}-500`,
                  isUpcoming && "border-gray-300 text-gray-400"
                )}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: index * 0.1 }}
              >
                {isCompleted ? (
                  <motion.svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </motion.svg>
                ) : (
                  <span className="text-sm font-medium">{index + 1}</span>
                )}
              </motion.div>
              
              {/* Step content */}
              <div className={cn(
                "ml-3",
                !isHorizontal && "flex-1"
              )}>
                <div className={cn(
                  "text-sm font-medium",
                  isCompleted && "text-green-600",
                  isCurrent && "text-gray-900",
                  isUpcoming && "text-gray-400"
                )}>
                  {step.label}
                </div>
                {step.description && (
                  <div className="text-xs text-gray-500 mt-1">
                    {step.description}
                  </div>
                )}
              </div>
            </div>
            
            {/* Connector line */}
            {index < steps.length - 1 && (
              <div className={cn(
                isHorizontal ? "flex-1 h-px bg-gray-300 mx-2" : "w-px h-8 bg-gray-300 ml-4 mt-2"
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
})

StepProgress.displayName = "StepProgress"

export { Progress, CircularProgress, StepProgress }
export type { ProgressProps, CircularProgressProps, StepProgressProps }