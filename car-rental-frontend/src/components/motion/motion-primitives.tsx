"use client";

import { motion, type HTMLMotionProps } from "motion/react";

interface MotionPrimitiveProps extends HTMLMotionProps<"div"> {
  delay?: number;
}

export function FadeUp({
  children,
  delay = 0,
  transition,
  ...props
}: MotionPrimitiveProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay, ...transition }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function ScaleFade({
  children,
  delay = 0,
  transition,
  ...props
}: MotionPrimitiveProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.26, delay, ...transition }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function Reveal({
  children,
  delay = 0,
  transition,
  ...props
}: MotionPrimitiveProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: 0.38, delay, ...transition }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function HoverLift({
  children,
  transition,
  ...props
}: HTMLMotionProps<"div">) {
  return (
    <motion.div
      whileHover={{ y: -6, scale: 1.008 }}
      transition={{ duration: 0.2, ...transition }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function StaggerContainer({
  children,
  transition,
  ...props
}: HTMLMotionProps<"div">) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.06, ...transition } },
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function PageEntrance(props: HTMLMotionProps<"main">) {
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.24 }}
      {...props}
    />
  );
}
