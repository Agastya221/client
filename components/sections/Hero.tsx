import React from 'react';

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-background pt-24 pb-32">
      <div className="absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-blue-500/10 to-transparent blur-3xl -z-10" />
      <div className="container mx-auto px-4 text-center">
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-foreground mb-6">
          The Future of <span className="text-blue-600 dark:text-blue-400">Innovation</span>
        </h1>
        <p className="text-xl text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto mb-10">
          Empower your team with our state-of-the-art platform. Fast, reliable, and beautifully designed to help you build the next big thing.
        </p>
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
          <button className="px-8 py-4 bg-foreground text-background font-medium rounded-full hover:opacity-90 transition-opacity w-full sm:w-auto">
            Get Started
          </button>
          <button className="px-8 py-4 bg-transparent border border-neutral-200 dark:border-neutral-800 text-foreground font-medium rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors w-full sm:w-auto">
            Book a Demo
          </button>
        </div>
      </div>
    </section>
  );
}
