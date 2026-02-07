import React from "react";

interface SkeletonLoaderProps {
    /** Width of the skeleton - can be a Tailwind class or CSS value */
    width?: string;
    /** Height of the skeleton - can be a Tailwind class or CSS value */
    height?: string;
    /** Shape variant: 'rectangle', 'circle', or 'text' */
    variant?: "rectangle" | "circle" | "text";
    /** Number of text lines to render (only for 'text' variant) */
    lines?: number;
    /** Additional CSS classes */
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
            className={`h-4 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 rounded animate-shimmer ${width} ${className}`}
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
                    <SkeletonLine
                        key={i}
                        width={i === lines - 1 ? "w-3/4" : "w-full"}
                    />
                ))}
            </div>
        );
    }

    if (variant === "circle") {
        return (
            <div
                className={`rounded-full bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 animate-shimmer ${width} ${height} ${className}`}
            />
        );
    }

    // Default: rectangle
    return (
        <div
            className={`bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 rounded animate-shimmer ${width} ${height} ${className}`}
        />
    );
}

// Config skeleton for ConfigView
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
                        <SkeletonLoader width="w-full" height="h-12" className="rounded-xl" />
                    </div>
                    <div>
                        <SkeletonLoader width="w-32" height="h-4" className="mb-2" />
                        <SkeletonLoader width="w-full" height="h-12" className="rounded-xl" />
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

// Universal page skeleton for lazy loading fallback
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
                    <SkeletonLoader width="w-full" height="h-12" className="mb-4 rounded-xl" />
                    <SkeletonLoader width="w-full" height="h-24" className="mb-4 rounded-xl" />
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

// Wrapper component with smooth transition from skeleton to content
interface LoadingWrapperProps {
    isLoading: boolean;
    skeleton?: React.ReactNode;
    children: React.ReactNode;
    /** Minimum time to show skeleton in ms (default: 300) to prevent flickering */
    minDisplayTime?: number;
}

export function LoadingWrapper({
    isLoading,
    skeleton = <PageSkeleton />,
    children,
    minDisplayTime = 200
}: LoadingWrapperProps): React.JSX.Element {
    const [elapsed, setElapsed] = React.useState(false);

    React.useEffect(() => {
        const timer = setTimeout(() => {
            setElapsed(true);
        }, minDisplayTime);
        return () => clearTimeout(timer);
    }, [minDisplayTime]);

    // Show skeleton if loading is true OR minimum time hasn't elapsed
    if (isLoading || !elapsed) {
        return <>{skeleton}</>;
    }

    return (
        <div className="animate-fadeIn">
            {children}
        </div>
    );
}
