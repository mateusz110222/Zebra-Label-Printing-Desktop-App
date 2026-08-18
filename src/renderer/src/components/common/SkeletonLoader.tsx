import React from "react";

interface SkeletonLoaderProps {
  width?: string;
  height?: string;
  variant?: "rectangle" | "circle" | "text";
  lines?: number;
  className?: string;
}

function SkeletonLine({
  width = "w-full",
  className = "",
}: {
  width?: string;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={`h-4 bg-linear-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 rounded animate-shimmer ${width} ${className}`}
    />
  );
}

export default function SkeletonLoader({
  width = "w-full",
  height = "h-4",
  variant = "rectangle",
  lines = 3,
  className = "",
}: SkeletonLoaderProps): React.JSX.Element {
  if (variant === "text") {
    return (
      <div className={`space-y-3 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonLine key={i} width={i === lines - 1 ? "w-3/4" : "w-full"} />
        ))}
      </div>
    );
  }

  if (variant === "circle") {
    return (
      <div
        className={`rounded-full bg-linear-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 animate-shimmer ${width} ${height} ${className}`}
      />
    );
  }

  return (
    <div
      className={`bg-linear-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 rounded animate-shimmer ${width} ${height} ${className}`}
    />
  );
}

export function ConfigViewSkeleton(): React.JSX.Element {
  return (
    <div className="min-h-full flex items-start justify-center p-8">
      <div className="w-full max-w-3xl bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="space-y-2">
            <SkeletonLoader width="w-48" height="h-8" />
            <SkeletonLoader width="w-72" height="h-4" />
          </div>
          <SkeletonLoader width="w-10" height="h-10" variant="circle" />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <SkeletonLoader width="w-24" height="h-10" className="rounded-lg" />
          <SkeletonLoader width="w-24" height="h-10" className="rounded-lg" />
        </div>

        {/* Form fields */}
        <div className="space-y-6">
          <div>
            <SkeletonLoader width="w-32" height="h-4" className="mb-2" />
            <SkeletonLoader
              width="w-full"
              height="h-12"
              className="rounded-xl"
            />
          </div>
          <div>
            <SkeletonLoader width="w-32" height="h-4" className="mb-2" />
            <SkeletonLoader
              width="w-full"
              height="h-12"
              className="rounded-xl"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-100 dark:border-slate-700">
          <SkeletonLoader width="w-28" height="h-10" className="rounded-lg" />
          <SkeletonLoader width="w-28" height="h-10" className="rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function PageSkeleton(): React.JSX.Element {
  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl w-full mx-auto">
        {/* Header */}
        <div className="mb-8">
          <SkeletonLoader width="w-48" height="h-8" className="mb-3" />
          <SkeletonLoader width="w-72" height="h-4" />
        </div>

        {/* Main card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 p-6 mb-6">
          <SkeletonLoader
            width="w-full"
            height="h-12"
            className="mb-4 rounded-xl"
          />
          <SkeletonLoader
            width="w-full"
            height="h-24"
            className="mb-4 rounded-xl"
          />
          <SkeletonLoader width="w-3/4" height="h-16" className="rounded-xl" />
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center">
          <SkeletonLoader width="w-32" height="h-4" />
          <SkeletonLoader width="w-36" height="h-10" className="rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function AuditLogsViewSkeleton(): React.JSX.Element {
  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-6 space-y-3">
          <SkeletonLoader width="w-64" height="h-8" />
          <SkeletonLoader width="w-96 max-w-full" height="h-4" />
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {[0, 1].map((item) => (
            <div
              key={item}
              className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
            >
              <SkeletonLoader
                width="w-12"
                height="h-12"
                className="rounded-lg"
              />
              <div className="flex-1 space-y-2">
                <SkeletonLoader width="w-40" height="h-5" />
                <SkeletonLoader width="w-3/4" height="h-3" />
              </div>
            </div>
          ))}
        </div>

        <div className="mb-4 flex items-end justify-between gap-4">
          <div className="space-y-2">
            <SkeletonLoader width="w-64" height="h-7" />
            <SkeletonLoader width="w-80 max-w-full" height="h-4" />
          </div>
          <div className="flex gap-2">
            <SkeletonLoader width="w-28" height="h-10" className="rounded-lg" />
            <SkeletonLoader width="w-32" height="h-10" className="rounded-lg" />
          </div>
        </div>

        <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-5 dark:border-slate-700 dark:bg-slate-800">
          {["xl:col-span-2", "", "", ""].map((className, item) => (
            <SkeletonLoader
              key={item}
              width="w-full"
              height="h-10"
              className={`rounded-lg ${className}`}
            />
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-slate-200 p-4 dark:border-slate-700">
            <SkeletonLoader width="w-full" height="h-5" />
          </div>
          <div className="space-y-0">
            {Array.from({ length: 6 }).map((_, row) => (
              <div
                key={row}
                className="grid grid-cols-5 gap-5 border-b border-slate-100 p-4 last:border-0 dark:border-slate-700/60"
              >
                {Array.from({ length: 5 }).map((__, cell) => (
                  <SkeletonLoader
                    key={cell}
                    width={cell === 1 ? "w-3/4" : "w-full"}
                    height="h-4"
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SystemHealthViewSkeleton(): React.JSX.Element {
  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="space-y-3">
            <SkeletonLoader width="w-52" height="h-8" />
            <SkeletonLoader width="w-96 max-w-full" height="h-4" />
          </div>
          <SkeletonLoader width="w-32" height="h-10" className="rounded-lg" />
        </div>

        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <SkeletonLoader width="w-28" height="h-4" className="mb-3" />
          <SkeletonLoader width="w-2/3" height="h-7" className="mb-2" />
          <SkeletonLoader width="w-48" height="h-3" />
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, card) => (
            <div
              key={card}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="mb-6 flex items-center justify-between">
                <SkeletonLoader width="w-32" height="h-5" />
                <SkeletonLoader
                  width="w-14"
                  height="h-7"
                  className="rounded-full"
                />
              </div>
              <div className="space-y-5">
                {["w-full", "w-3/4", "w-5/6", "w-2/3"].map((width, row) => (
                  <div key={row} className="space-y-2">
                    <SkeletonLoader width="w-24" height="h-3" />
                    <SkeletonLoader width={width} height="h-4" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface LoadingWrapperProps {
  isLoading: boolean;
  skeleton?: React.ReactNode;
  children: React.ReactNode;
  minDisplayTime?: number;
}

export function LoadingWrapper({
  isLoading,
  skeleton = <PageSkeleton />,
  children,
  minDisplayTime = 200,
}: LoadingWrapperProps): React.JSX.Element {
  const [elapsed, setElapsed] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setElapsed(true);
    }, minDisplayTime);
    return () => clearTimeout(timer);
  }, [minDisplayTime]);

  if (isLoading || !elapsed) {
    return <>{skeleton}</>;
  }

  return <div className="animate-fadeIn">{children}</div>;
}
