import { Button as BaseButton } from '@base-ui/react/button'
import type { ComponentProps } from 'react'
import { cn } from './cn'

type BaseButtonProps = ComponentProps<typeof BaseButton>

export type ButtonProps = Omit<BaseButtonProps, 'className'> & {
  className?: string
}

const styles =
  'inline-flex items-center justify-center gap-2 rounded-md border border-surface-raised bg-card px-4 py-2 text-base font-medium text-on-card transition-colors duration-ui ease-standard hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50'

export function Button({ className, ...props }: ButtonProps) {
  return <BaseButton className={cn(styles, className)} {...props} />
}
