import { Link } from "react-router-dom";

export const Logo = ({ className = "" }: { className?: string }) => (
  <Link to="/" className={`flex items-center gap-2 group ${className}`}>
    <div className="relative h-8 w-8 rounded-xl bg-gradient-glow shadow-glow flex items-center justify-center">
      <div className="h-3 w-3 rounded-md bg-background" />
    </div>
    <span className="font-display text-lg font-semibold tracking-tight">
      Hirev<span className="text-primary">AI</span>
    </span>
  </Link>
);
