import React from "react";

interface ComponentCardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  desc?: string;
  headerRight?: React.ReactNode;
}

const ComponentCard: React.FC<ComponentCardProps> = ({
  title,
  children,
  className = "",
  desc = "",
  headerRight,
}) => {
  return (
    <div className={`rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${className}`}>
      {(title || desc || headerRight) && (
        <div className="flex items-start justify-between px-6 py-5">
          <div className="min-w-0 flex-1">
            {title && <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>}
            {desc && <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{desc}</p>}
          </div>
          {headerRight && <div className="ml-4 shrink-0">{headerRight}</div>}
        </div>
      )}
      <div className="px-6 pb-6">
        <div className="space-y-6">{children}</div>
      </div>
    </div>
  );
};

export default ComponentCard;
