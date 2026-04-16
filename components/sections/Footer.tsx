import React from 'react';

export default function Footer() {
  return (
    <footer className="py-12 border-t border-neutral-200 dark:border-neutral-800 bg-background text-neutral-600 dark:text-neutral-400">
      <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <span className="font-bold text-xl text-foreground tracking-tight">Product.</span>
          <p className="mt-2 text-sm">© {new Date().getFullYear()} Company Inc. All rights reserved.</p>
        </div>
        <div className="flex gap-6">
          <a href="#" className="hover:text-foreground transition-colors">Twitter</a>
          <a href="#" className="hover:text-foreground transition-colors">GitHub</a>
          <a href="#" className="hover:text-foreground transition-colors">Discord</a>
        </div>
      </div>
    </footer>
  );
}
