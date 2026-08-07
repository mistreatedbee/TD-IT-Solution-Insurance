export default {content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}'
],
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary)',
        'primary-foreground': 'var(--primary-foreground)',
        secondary: 'var(--secondary)',
        'secondary-foreground': 'var(--secondary-foreground)',
        'accent-gradient-start': 'var(--accent-gradient-start)',
        'accent-gradient-mid': 'var(--accent-gradient-mid)',
        'accent-gradient-end': 'var(--accent-gradient-end)',
        'accent-gold': 'var(--accent-gold)',
        'surface-navy-deep': 'var(--surface-navy-deep)',
        'surface-navy': 'var(--surface-navy)',
        background: 'var(--background)',
        'background-alt': 'var(--background-alt)',
        'background-pattern': 'var(--background-pattern)',
        card: 'var(--card)',
        'card-elevated': 'var(--card-elevated)',
        success: 'var(--success)',
        'success-light': 'var(--success-light)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-inverse': 'var(--text-inverse)',
        'text-inverse-muted': 'var(--text-inverse-muted)',
        'glass-background': 'var(--glass-background)',
        'glass-background-strong': 'var(--glass-background-strong)',
        'glass-background-soft': 'var(--glass-background-soft)',
        'glass-border': 'var(--glass-border)',
        hairline: 'var(--hairline)',
        border: 'var(--border)',
        'dark-background': 'var(--dark-background)',
        'dark-background-alt': 'var(--dark-background-alt)',
        'dark-surface': 'var(--dark-surface)',
        'dark-card': 'var(--dark-card)',
        'dark-card-elevated': 'var(--dark-card-elevated)',
        'dark-primary': 'var(--dark-primary)',
        'dark-primary-foreground': 'var(--dark-primary-foreground)',
        'dark-secondary': 'var(--dark-secondary)',
        'dark-accent-gradient-start': 'var(--dark-accent-gradient-start)',
        'dark-accent-gradient-end': 'var(--dark-accent-gradient-end)',
        'dark-accent-gold': 'var(--dark-accent-gold)',
        'dark-success': 'var(--dark-success)',
        'dark-success-light': 'var(--dark-success-light)',
        'dark-text-primary': 'var(--dark-text-primary)',
        'dark-text-secondary': 'var(--dark-text-secondary)',
        'dark-text-inverse': 'var(--dark-text-inverse)',
        'dark-glass-background': 'var(--dark-glass-background)',
        'dark-glass-border': 'var(--dark-glass-border)',
        'dark-hairline': 'var(--dark-hairline)',
        'dark-border': 'var(--dark-border)',
        'card-padding-min': 'var(--card-padding-min)',
        'card-padding-max': 'var(--card-padding-max)',
        'radius-input': 'var(--radius-input)',
        'radius-card': 'var(--radius-card)',
        'radius-card-lg': 'var(--radius-card-lg)',
        'elevation-card-hover-lift': 'var(--elevation-card-hover-lift)',
        'elevation-card-hover-lift-sm': 'var(--elevation-card-hover-lift-sm)',
        'transition-card-hover': 'var(--transition-card-hover)'
      },
      boxShadow: {
        resting: 'var(--shadow-resting)',
        hover: 'var(--shadow-hover)'
      },
      fontFamily: {
        heading: ['Inter', 'sans-serif'],
        body: ['Inter', 'sans-serif']
      }
    }
  }
}