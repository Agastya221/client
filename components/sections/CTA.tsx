import React from 'react';

export default function CTA() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-blue-600 dark:bg-blue-900 -z-20" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent -z-10" />
      <div className="container mx-auto px-4 text-center text-white">
        <h2 className="text-4xl md:text-5xl font-bold mb-6">Ready to get started?</h2>
        <p className="text-xl text-blue-100 max-w-2xl mx-auto mb-10">
          Join thousands of other forward-thinking companies building the future with our platform.
        </p>
        <button className="px-8 py-4 bg-white text-blue-900 font-semibold rounded-full hover:bg-neutral-100 transition-colors shadow-lg">
          Start for Free
        </button>
      </div>
    </section>
  );
}
