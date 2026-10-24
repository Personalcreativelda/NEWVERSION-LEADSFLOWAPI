import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium tracking-tight transition-all duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:brightness-110",
        destructive:
          "bg-destructive text-white hover:brightness-110 focus-visible:ring-destructive/40",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-muted dark:border-white/[0.12] dark:hover:bg-white/[0.05]",
        secondary:
          "bg-secondary text-secondary-foreground border border-border hover:bg-muted dark:border-white/[0.07] dark:hover:bg-white/[0.05]",
        ghost:
          "text-foreground hover:bg-muted dark:hover:bg-white/[0.06]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-lg gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-11 rounded-lg px-5 has-[>svg]:px-4 text-[15px]",
        icon: "size-9 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

/** Ícone decorativo: elemento de componente (lucide/marca) sem filhos. O spinner fica. */
function isDecorativeIcon(node: React.ReactNode): boolean {
  if (!React.isValidElement(node) || typeof node.type === "string") return false;
  const props = node.props as { children?: React.ReactNode; className?: string };
  if (props.children != null) return false;
  return !/\banimate-spin\b/.test(props.className || "");
}

function hasText(nodes: React.ReactNode[]): boolean {
  return nodes.some((node) =>
    (typeof node === "string" && node.trim() !== "") ||
    typeof node === "number" ||
    (React.isValidElement(node) && node.type === React.Fragment &&
      hasText(React.Children.toArray((node.props as { children?: React.ReactNode }).children))),
  );
}

/**
 * Botão com texto não leva ícone (padrão do app: o ícone mais o gap e o mr-2 deixavam
 * espaços estranhos). Botões só com ícone, ou com o texto num <span> que se esconde no
 * telemóvel, ficam como estão.
 */
function textOnly(children: React.ReactNode): React.ReactNode {
  const nodes = React.Children.toArray(children);
  if (!hasText(nodes)) return children;
  // Só o ícone à esquerda do texto: setas e ícones depois do texto (ex.: "Mais ▾") ficam
  const firstText = nodes.findIndex((node) => hasText([node]));
  return nodes
    .filter((node, i) => i > firstText || !isDecorativeIcon(node))
    .map((node) =>
      React.isValidElement(node) && node.type === React.Fragment
        ? React.cloneElement(node, undefined, textOnly((node.props as { children?: React.ReactNode }).children))
        : node,
    );
}

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean;
    }
>(({ className, variant, size, asChild = false, children, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {asChild || size === "icon" ? children : textOnly(children)}
    </Comp>
  );
});

Button.displayName = "Button";

export { Button, buttonVariants };
