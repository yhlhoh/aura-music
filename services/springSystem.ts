

/**
 * Advanced Spring Physics System
 * Supports multiple properties (x, y, scale, etc.) simultaneously.
 */

export interface SpringConfig {
    mass: number;
    stiffness: number;
    damping: number;
    precision?: number; // Stop threshold
}

export const DEFAULT_SPRING: SpringConfig = {
    mass: 1,
    stiffness: 120,
    damping: 20,
    precision: 0.01
};


export const POS_Y_SPRING: SpringConfig = {
    mass: 0.9,
    stiffness: 100,
    damping: 20, // Critical ~19
    precision: 0.1
};

export const SCALE_SPRING: SpringConfig = {
    mass: 2,
    stiffness: 100,
    damping: 28, // Increased damping
    precision: 0.01
};

export const SCALE_BG_SPRING: SpringConfig = {
    mass: 1,
    stiffness: 50,
    damping: 20,
    precision: 0.01
};

// --- Apple Music Style Physics Presets ---

// Past lines: High stiffness to "throw" them out of view quickly without bouncing back
export const PAST_SPRING: SpringConfig = {
    mass: 0.8,
    stiffness: 220, // Stiffer
    damping: 40,    // Overdamped to prevent any return bounce
    precision: 0.1
};

// Current line: Critically damped for fast arrival with minimal to no overshoot
export const ACTIVE_SPRING: SpringConfig = {
    mass: 1,
    stiffness: 170, // Fast response
    damping: 26,    // Critical damping (2*sqrt(170*1) ≈ 26.07). Zero bounce.
    precision: 0.1
};

// Future lines: Tighter follower
export const FUTURE_SPRING: SpringConfig = {
    mass: 1.1,
    stiffness: 100,
    damping: 22,    // Critical damping (2*sqrt(100*1.1) ≈ 20.9). Slightly overdamped.
    precision: 0.1
};

export class SpringSystem {
    private current: Record<string, number> = {};
    private target: Record<string, number> = {};
    private velocity: Record<string, number> = {};
    private config: Record<string, SpringConfig> = {};

    constructor(initialValues: Record<string, number>) {
        this.current = { ...initialValues };
        this.target = { ...initialValues };
        // Initialize velocities to 0
        Object.keys(initialValues).forEach(k => this.velocity[k] = 0);
    }

    setTarget(key: string, value: number, config: SpringConfig = DEFAULT_SPRING) {
        this.target[key] = value;
        this.config[key] = config;
        if (this.velocity[key] === undefined) this.velocity[key] = 0;
        if (this.current[key] === undefined) this.current[key] = value;
    }

    // Force a value immediately (reset)
    setValue(key: string, value: number) {
        this.current[key] = value;
        this.target[key] = value;
        this.velocity[key] = 0;
    }

    // Inject momentum (e.g. scroll flick)
    setVelocity(key: string, value: number) {
        this.velocity[key] = value;
    }

    getCurrent(key: string): number {
        return this.current[key] || 0;
    }

    update(dt: number): boolean {
        let isMoving = false;

        Object.keys(this.current).forEach(key => {
            const p = this.config[key] || DEFAULT_SPRING;
            const current = this.current[key];
            const target = this.target[key] ?? current;
            const velocity = this.velocity[key] ?? 0;

            // Spring Force Calculation (Hooke's Law + Damping)
            // F = -k(x - target) - c(v)
            const displacement = current - target;
            const springForce = -p.stiffness * displacement;
            const dampingForce = -p.damping * velocity;
            const acceleration = (springForce + dampingForce) / p.mass;

            const newVelocity = velocity + acceleration * dt;
            const newPosition = current + newVelocity * dt;

            const precision = p.precision ?? 0.01;

            // Removed overshoot check which caused the snapping effect
            // We rely on critical/over-damping and low velocity threshold
            const isNearRest = Math.abs(newVelocity) < precision && Math.abs(newPosition - target) < precision;

            if (isNearRest) {
                this.current[key] = target;
                this.velocity[key] = 0;
            } else {
                this.current[key] = newPosition;
                this.velocity[key] = newVelocity;
                isMoving = true;
            }
        });

        return isMoving;
    }
}
