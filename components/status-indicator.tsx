import { cn } from "@/lib/utils"

interface StatusIndicatorProps {
  status: 'online' | 'offline' | 'loading' | 'error'
  label?: string
  className?: string
}

export function StatusIndicator({ status, label, className }: StatusIndicatorProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'online': return 'bg-green-500'
      case 'offline': return 'bg-red-500'
      case 'loading': return 'bg-yellow-500 animate-pulse'
      case 'error': return 'bg-red-500 animate-pulse'
      default: return 'bg-gray-500'
    }
  }

  const getStatusIcon = () => {
    switch (status) {
      case 'online': return '✅'
      case 'offline': return '❌'
      case 'loading': return '⏳'
      case 'error': return '⚠️'
      default: return '❓'
    }
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("h-2 w-2 rounded-full", getStatusColor())} />
      {label && (
        <span className="text-sm text-gray-600">
          {getStatusIcon()} {label}
        </span>
      )}
    </div>
  )
}