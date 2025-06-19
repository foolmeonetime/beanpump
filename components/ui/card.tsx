import * as React from "react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "outlined" | "filled"
  interactive?: boolean
  loading?: boolean
}

const cardVariants = {
  default: "border bg-card text-card-foreground shadow-sm",
  elevated: "border bg-card text-card-foreground shadow-lg",
  outlined: "border-2 bg-card text-card-foreground shadow-none",
  filled: "border-0 bg-primary text-primary-foreground shadow-md"
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", interactive = false, loading = false, children, ...props }, ref) => {
    const cardContent = (
      <div
        ref={ref}
        className={cn(
          "rounded-xl transition-all duration-200",
          cardVariants[variant],
          interactive && "cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]",
          loading && "animate-pulse",
          className
        )}
        {...props}
      >
        {loading ? (
          <div className="p-6 space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            <div className="space-y-2">
              <div className="h-2 bg-gray-200 rounded"></div>
              <div className="h-2 bg-gray-200 rounded w-5/6"></div>
            </div>
          </div>
        ) : (
          children
        )}
      </div>
    )

    return interactive ? (
      <motion.div
        whileHover={{ y: -2, transition: { duration: 0.2 } }}
        whileTap={{ scale: 0.98 }}
      >
        {cardContent}
      </motion.div>
    ) : (
      cardContent
    )
  }
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div 
    ref={ref} 
    className={cn("flex flex-col space-y-1.5 p-6 pb-3", className)} 
    {...props} 
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement> & {
    level?: 1 | 2 | 3 | 4 | 5 | 6
  }
>(({ className, level = 3, children, ...props }, ref) => {
  const baseStyles = "font-semibold leading-none tracking-tight";
  const sizeStyles = {
    1: "text-3xl",
    2: "text-2xl", 
    3: "text-xl",
    4: "text-lg",
    5: "text-base",
    6: "text-sm"
  };
  
  const combinedClassName = cn(baseStyles, sizeStyles[level], className);
  
  // Use createElement to avoid type issues
  return React.createElement(
    `h${level}`,
    {
      ref,
      className: combinedClassName,
      ...props
    },
    children
  );
})
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground leading-relaxed", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    align?: "left" | "center" | "right" | "between"
  }
>(({ className, align = "left", ...props }, ref) => (
  <div 
    ref={ref} 
    className={cn(
      "flex items-center p-6 pt-0",
      align === "left" && "justify-start",
      align === "center" && "justify-center", 
      align === "right" && "justify-end",
      align === "between" && "justify-between",
      className
    )} 
    {...props} 
  />
))
CardFooter.displayName = "CardFooter"

// Specialized card components for common use cases

interface StatsCardProps {
  title: string
  value: string | number
  description?: string
  trend?: {
    value: number
    isPositive?: boolean
  }
  icon?: React.ReactNode
  className?: string
}

const StatsCard = React.forwardRef<HTMLDivElement, StatsCardProps>(
  ({ title, value, description, trend, icon, className, ...props }, ref) => (
    <Card ref={ref} className={cn("p-6", className)} {...props}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
          <motion.p 
            className="text-3xl font-bold"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {value}
          </motion.p>
          {description && (
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          )}
          {trend && (
            <div className={cn(
              "flex items-center mt-2 text-xs",
              trend.isPositive ? "text-green-600" : "text-red-600"
            )}>
              <span className="mr-1">
                {trend.isPositive ? "↗" : "↘"}
              </span>
              {Math.abs(trend.value)}%
            </div>
          )}
        </div>
        {icon && (
          <div className="text-muted-foreground">
            {icon}
          </div>
        )}
      </div>
    </Card>
  )
)
StatsCard.displayName = "StatsCard"

interface FeatureCardProps {
  title: string
  description: string
  icon?: React.ReactNode
  action?: {
    label: string
    onClick: () => void
  }
  badge?: {
    label: string
    variant?: "default" | "success" | "warning" | "danger"
  }
  className?: string
}

const FeatureCard = React.forwardRef<HTMLDivElement, FeatureCardProps>(
  ({ title, description, icon, action, badge, className, ...props }, ref) => (
    <Card ref={ref} interactive={!!action} className={cn("group", className)} {...props}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            {icon && (
              <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                {icon}
              </div>
            )}
            <div>
              <CardTitle level={4}>{title}</CardTitle>
              {badge && (
                <span className={cn(
                  "inline-block px-2 py-1 text-xs rounded-full mt-2",
                  badge.variant === "success" && "bg-green-100 text-green-800",
                  badge.variant === "warning" && "bg-yellow-100 text-yellow-800", 
                  badge.variant === "danger" && "bg-red-100 text-red-800",
                  (!badge.variant || badge.variant === "default") && "bg-gray-100 text-gray-800"
                )}>
                  {badge.label}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription>{description}</CardDescription>
      </CardContent>
      {action && (
        <CardFooter>
          <button 
            onClick={action.onClick}
            className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
          >
            {action.label} →
          </button>
        </CardFooter>
      )}
    </Card>
  )
)
FeatureCard.displayName = "FeatureCard"

// Image card with overlay
interface ImageCardProps {
  src: string
  alt: string
  title: string
  description?: string
  overlay?: boolean
  aspectRatio?: "square" | "video" | "portrait"
  className?: string
}

const ImageCard = React.forwardRef<HTMLDivElement, ImageCardProps>(
  ({ src, alt, title, description, overlay = true, aspectRatio = "video", className, ...props }, ref) => (
    <Card ref={ref} className={cn("overflow-hidden group", className)} {...props}>
      <div className={cn(
        "relative",
        aspectRatio === "square" && "aspect-square",
        aspectRatio === "video" && "aspect-video", 
        aspectRatio === "portrait" && "aspect-[3/4]"
      )}>
        <img 
          src={src}
          alt={alt}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {overlay && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        )}
        <div className={cn(
          "absolute bottom-0 left-0 right-0 p-4 text-white",
          !overlay && "bg-white text-gray-900 border-t"
        )}>
          <h3 className="font-semibold">{title}</h3>
          {description && (
            <p className={cn(
              "text-sm mt-1",
              overlay ? "text-gray-200" : "text-gray-600"
            )}>
              {description}
            </p>
          )}
        </div>
      </div>
    </Card>
  )
)
ImageCard.displayName = "ImageCard"

// Expandable card with collapsible content
interface ExpandableCardProps {
  title: string
  description?: string
  children: React.ReactNode
  defaultExpanded?: boolean
  className?: string
}

const ExpandableCard = React.forwardRef<HTMLDivElement, ExpandableCardProps>(
  ({ title, description, children, defaultExpanded = false, className, ...props }, ref) => {
    const [isExpanded, setIsExpanded] = React.useState(defaultExpanded)

    return (
      <Card ref={ref} className={className} {...props}>
        <CardHeader 
          className="cursor-pointer select-none"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{title}</CardTitle>
              {description && <CardDescription>{description}</CardDescription>}
            </div>
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              ↓
            </motion.div>
          </div>
        </CardHeader>
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: "hidden" }}
            >
              <CardContent>
                {children}
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    )
  }
)
ExpandableCard.displayName = "ExpandableCard"

export { 
  Card, 
  CardHeader, 
  CardFooter, 
  CardTitle, 
  CardDescription, 
  CardContent,
  StatsCard,
  FeatureCard,
  ImageCard,
  ExpandableCard
}

export type { 
  CardProps, 
  StatsCardProps, 
  FeatureCardProps, 
  ImageCardProps, 
  ExpandableCardProps 
}