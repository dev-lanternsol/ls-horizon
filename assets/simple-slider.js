// ============================================================================
// SLIDER CONFIGURATION & UTILITIES
// ============================================================================

const SLIDER_CONFIG = {
  DRAG_THRESHOLD: 8,
  SCROLL_DURATION: 300,
  MOMENTUM_DECAY: 0.92,
  VELOCITY_THRESHOLD: 0.5,
  VELOCITY_MULTIPLIER: 0.8,
  DRAG_MULTIPLIER: 1.5,
  MOMENTUM_MIN_VELOCITY: 2,
  MOBILE_BREAKPOINT: 649
};

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

const isMobile = () => window.innerWidth <= SLIDER_CONFIG.MOBILE_BREAKPOINT;

// ============================================================================
// SLIDER CALCULATIONS
// ============================================================================

class SliderCalculator {
  constructor(slider) {
    this.slider = slider;
    this.track = slider.querySelector('.slider-track');
    this.update();
  }

  update() {
    if (!this.track) return;
    const children = Array.from(this.track.children);
    
    if (!children.length) {
      this.columnWidth = 0;
      this.gap = 0;
      this.snapPoints = [];
      return;
    }

    const firstChild = children[0];
    this.columnWidth = firstChild.offsetWidth;
    
    const gapFromCSS = getComputedStyle(this.track).getPropertyValue('gap').trim() || getComputedStyle(this.slider).getPropertyValue('--gap').trim();
    
    if (gapFromCSS) {
      this.gap = parseFloat(gapFromCSS);
      if (gapFromCSS.includes('rem')) {
        const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
        this.gap = this.gap * rootFontSize;
      } else if (gapFromCSS.includes('em')) {
        const fontSize = parseFloat(getComputedStyle(this.slider).fontSize);
        this.gap = this.gap * fontSize;
      }
    } else {
      this.gap = children[1] 
        ? children[1].offsetLeft - firstChild.offsetLeft - this.columnWidth 
        : 0;
    }

    this.slidesPerView = this.getSlidesPerView();
    this.slidesPerScroll = this.getSlidesPerScroll();
    
    this.snapPoints = this.calculateSnapPoints();
  }

  getSlidesPerView() {
    const mobile = isMobile();
    const mobileAttr = this.slider.getAttribute('data-mobile-slides-to-show');
    const desktopAttr = this.slider.getAttribute('data-slides-to-show');
    
    if (mobile && mobileAttr) return parseInt(mobileAttr, 10);
    return desktopAttr ? parseInt(desktopAttr, 10) : 1;
  }

  getSlidesPerScroll() {
    const mobile = isMobile();
    const mobileAttr = this.slider.getAttribute('data-mobile-slides-to-scroll');
    const desktopAttr = this.slider.getAttribute('data-slides-to-scroll');
    
    if (mobile && mobileAttr) return parseInt(mobileAttr, 10);
    if (desktopAttr) return parseInt(desktopAttr, 10);
    return this.slidesPerView;
  }

  calculateSnapPoints() {
    if (!this.track) return [];
    const children = Array.from(this.track.children);
    if (!children.length) return [];

    const sliderWidth = this.slider.clientWidth;
    const trackWidth = children.reduce((width, slide) => width + slide.offsetWidth, 0) + (children.length - 1) * this.gap;
    const maxScroll = Math.max(0, trackWidth - sliderWidth);
    const snapPoints = [];
    
    for (let i = 0; i < children.length; i += this.slidesPerScroll) {
      const position = i * (this.columnWidth + this.gap);
      if (position <= maxScroll) {
        snapPoints.push(position);
      }
    }

    if (snapPoints[snapPoints.length - 1] < maxScroll) {
      snapPoints.push(maxScroll);
    }

    return [...new Set(snapPoints)];
  }

  findNearestSnapPoint(currentPosition = 0) {
    if (!this.snapPoints.length) return 0;
    return this.snapPoints.reduce((nearest, snap) => 
      Math.abs(currentPosition - snap) < Math.abs(currentPosition - nearest) ? snap : nearest
    , this.snapPoints[0]);
  }

  getNextSnapPoint(currentPosition = 0) {
    const nextSnap = this.snapPoints.find(snap => snap > currentPosition + 1);
    return nextSnap !== undefined ? nextSnap : this.snapPoints[this.snapPoints.length - 1] || 0;
  }

  getPrevSnapPoint(currentPosition = 0) {
    const reversedSnaps = [...this.snapPoints].reverse();
    const prevSnap = reversedSnaps.find(snap => snap < currentPosition - 1);
    return prevSnap !== undefined ? prevSnap : 0;
  }
}

// ============================================================================
// DRAGGABLE SLIDER (NOW USES TRANSFORM)
// ============================================================================

class DraggableSlider {
  constructor(slider) {
    this.slider = slider;
    this.track = slider.querySelector('.slider-track');
    if (!this.track) {
      console.error('Slider requires a child with class .slider-track', slider);
      return;
    }
    
    this.calculator = new SliderCalculator(slider);
    this.lastWidth = window.innerWidth;
    this.animationType = slider.getAttribute('data-animation-type') || 'slide';
    this.infiniteLoop = slider.getAttribute('data-infinite-loop') === 'true';
    
    // Check if slider should be initialized
    if (!this.shouldInitialize()) {
      this.slider.classList.add('slider-disabled');
      return;
    }
    
    this.slider.sliderInstance = this; // Make instance accessible to other classes
    
    this.state = {
      isDown: false,
      isDragging: false,
      wasDragging: false,
      startX: 0,
      startY: 0,
      startPosition: 0,
      currentPosition: 0,
      velocity: 0,
      lastX: 0,
      animationId: null,
      isAnimating: false,
      scrollDirection: null // Track if user is scrolling vertically or horizontally
    };

    this.init();
  }

  shouldInitialize() {
    const slideCount = this.track.children.length;
    const slidesToShow = this.calculator.slidesPerView;
    return slideCount > slidesToShow;
  }

  init() {
    // Disable native scrolling behavior for horizontal only
    this.slider.style.userSelect = 'none';
    this.slider.style.webkitUserSelect = 'none';
    
    // Add animation type class to slider
    this.slider.classList.add(`animation-${this.animationType}`);
    
    // For fade animation, disable dragging
    if (this.animationType === 'fade') {
      this.slider.style.cursor = 'default';
    }
    
    this.slider.addEventListener('dragstart', (e) => e.preventDefault());
    
    // Only add drag/touch events for slide animation
    if (this.animationType === 'slide') {
      // Mouse events
      this.slider.addEventListener('mousedown', (e) => this.handleMouseDown(e));
      this.slider.addEventListener('mousemove', (e) => this.handleMouseMove(e));
      this.slider.addEventListener('mouseup', () => this.handleMouseUp());
      this.slider.addEventListener('mouseleave', () => this.handleMouseUp());
      
      // Touch events
      this.slider.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
      this.slider.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
      this.slider.addEventListener('touchend', () => this.handleTouchEnd());
      this.slider.addEventListener('touchcancel', () => this.handleTouchEnd());
      
      this.slider.addEventListener('click', (e) => this.handleClick(e), true);
      this.slider.addEventListener('selectstart', (e) => { if (this.state.isDragging) e.preventDefault(); });
    }

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.slider);
    window.addEventListener('resize', () => this.handleResize());
  }

  handleResize() {
    const currentWidth = window.innerWidth;
    const crossedBreakpoint = (this.lastWidth <= SLIDER_CONFIG.MOBILE_BREAKPOINT && currentWidth > SLIDER_CONFIG.MOBILE_BREAKPOINT) ||
      (this.lastWidth > SLIDER_CONFIG.MOBILE_BREAKPOINT && currentWidth <= SLIDER_CONFIG.MOBILE_BREAKPOINT);
    
    this.calculator.update();
    
    // Check if slider should still be active after resize
    if (!this.shouldInitialize()) {
      this.slider.classList.add('slider-disabled');
      if (this.state.currentPosition !== 0) {
        this.animateTo(0, 0);
      }
      this.lastWidth = currentWidth;
      this.slider.dispatchEvent(new CustomEvent('sliderRecalculated'));
      return;
    }
    
    this.slider.classList.remove('slider-disabled');
    
    if (crossedBreakpoint) {
      const target = this.calculator.findNearestSnapPoint(this.state.currentPosition);
      this.animateTo(target, 0);
    }
    
    this.lastWidth = currentWidth;
    this.slider.dispatchEvent(new CustomEvent('sliderRecalculated'));
  }

  handleMouseDown(e) {
    if (this.state.isAnimating) return;
    if (this.state.animationId) {
      cancelAnimationFrame(this.state.animationId);
      this.state.animationId = null;
    }
    const rect = this.slider.getBoundingClientRect();
    this.state.isDown = true;
    this.state.isDragging = false;
    this.state.startX = e.clientX - rect.left;
    this.state.startY = e.clientY - rect.top;
    this.state.startPosition = this.state.currentPosition;
    this.state.lastX = e.clientX;
    this.state.velocity = 0;
  }

  handleMouseMove(e) {
    if (!this.state.isDown || this.state.isAnimating) return;

    const rect = this.slider.getBoundingClientRect();
    const currentX = e.clientX;
    const dx = currentX - (this.state.startX + rect.left);
    const dy = e.clientY - (this.state.startY + rect.top);

    if (!this.state.isDragging && Math.hypot(dx, dy) > SLIDER_CONFIG.DRAG_THRESHOLD) {
      this.state.isDragging = true;
      this.slider.classList.add('dragging');
    }

    if (!this.state.isDragging) return;
    e.preventDefault();

    this.state.velocity = (this.state.lastX - currentX) * SLIDER_CONFIG.VELOCITY_MULTIPLIER;
    this.state.lastX = currentX;
  }

  handleMouseUp() {
    if (!this.state.isDown || this.state.isAnimating) return;
    this.state.isDown = false;
    this.slider.classList.remove('dragging');

    if (this.state.isDragging) {
      this.state.wasDragging = true;
      // Determine direction based on accumulated velocity/distance
      if (Math.abs(this.state.velocity) > SLIDER_CONFIG.VELOCITY_THRESHOLD) {
        const direction = this.state.velocity > 0 ? 'next' : 'prev';
        this.slideInDirection(direction);
      } else {
        // If no significant velocity, stay at current position
        this.snapToNearest();
      }
    }
    this.state.isDragging = false;
  }

  handleTouchStart(e) {
    if (this.state.isAnimating) return;
    if (this.state.animationId) {
      cancelAnimationFrame(this.state.animationId);
      this.state.animationId = null;
    }
    const touch = e.touches[0];
    const rect = this.slider.getBoundingClientRect();
    this.state.isDown = true;
    this.state.isDragging = false;
    this.state.scrollDirection = null;
    this.state.startX = touch.clientX - rect.left;
    this.state.startY = touch.clientY - rect.top;
    this.state.startPosition = this.state.currentPosition;
    this.state.lastX = touch.clientX;
    this.state.velocity = 0;
  }

  handleTouchMove(e) {
    if (!this.state.isDown || this.state.isAnimating) return;

    const touch = e.touches[0];
    const rect = this.slider.getBoundingClientRect();
    const currentX = touch.clientX;
    const currentY = touch.clientY;
    const dx = currentX - (this.state.startX + rect.left);
    const dy = currentY - (this.state.startY + rect.top);

    // Determine scroll direction on first significant movement
    if (!this.state.scrollDirection && Math.hypot(dx, dy) > SLIDER_CONFIG.DRAG_THRESHOLD) {
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      
      // If vertical movement is greater, it's a vertical scroll
      if (absDy > absDx) {
        this.state.scrollDirection = 'vertical';
      } else {
        this.state.scrollDirection = 'horizontal';
        this.state.isDragging = true;
        this.slider.classList.add('dragging');
      }
    }

    // If user is scrolling vertically, don't interfere
    if (this.state.scrollDirection === 'vertical') return;

    // Only prevent default and handle horizontal dragging
    if (this.state.isDragging) {
      e.preventDefault();
      this.state.velocity = (this.state.lastX - currentX) * SLIDER_CONFIG.VELOCITY_MULTIPLIER;
      this.state.lastX = currentX;
    }
  }

  handleTouchEnd() {
    if (!this.state.isDown || this.state.isAnimating) return;
    
    // If it was a vertical scroll, don't do anything
    if (this.state.scrollDirection === 'vertical') {
      this.state.isDown = false;
      this.state.scrollDirection = null;
      return;
    }
    
    this.state.isDown = false;
    this.slider.classList.remove('dragging');

    if (this.state.isDragging) {
      this.state.wasDragging = true;
      // Determine direction based on accumulated velocity
      if (Math.abs(this.state.velocity) > SLIDER_CONFIG.VELOCITY_THRESHOLD) {
        const direction = this.state.velocity > 0 ? 'next' : 'prev';
        this.slideInDirection(direction);
      } else {
        // If no significant velocity, stay at current position
        this.snapToNearest();
      }
    }
    this.state.isDragging = false;
    this.state.scrollDirection = null;
  }

  handleClick(e) {
    if (this.state.wasDragging) {
      e.preventDefault();
      e.stopPropagation();
      setTimeout(() => { this.state.wasDragging = false; }, 0);
    }
  }

  slideInDirection(direction) {
    if (this.infiniteLoop) {
      this.slideInfinite(direction);
    } else if (this.animationType === 'fade') {
      this.fadeToDirection(direction);
    } else {
      let target;
      if (direction === 'next') {
        target = this.calculator.getNextSnapPoint(this.state.currentPosition);
      } else {
        target = this.calculator.getPrevSnapPoint(this.state.currentPosition);
      }
      this.animateTo(target);
    }
  }

  slideInfinite(direction) {
    if (this.animationType === 'fade') {
      this.fadeInfinite(direction);
    } else {
      // For slide animation with infinite loop
      const snapPoints = this.calculator.snapPoints;
      const currentIndex = snapPoints.findIndex(snap => 
        Math.abs(snap - this.state.currentPosition) < 10
      );
      
      let targetIndex;
      if (direction === 'next') {
        targetIndex = currentIndex >= snapPoints.length - 1 ? 0 : currentIndex + 1;
      } else {
        targetIndex = currentIndex <= 0 ? snapPoints.length - 1 : currentIndex - 1;
      }
      
      const target = snapPoints[targetIndex];
      this.animateTo(target);
    }
  }

  fadeInfinite(direction) {
    // For fade animation with infinite loop, just wrap around
    const snapPoints = this.calculator.snapPoints;
    const currentIndex = snapPoints.findIndex(snap => 
      Math.abs(snap - this.state.currentPosition) < 10
    );
    
    let targetIndex;
    if (direction === 'next') {
      targetIndex = currentIndex >= snapPoints.length - 1 ? 0 : currentIndex + 1;
    } else {
      targetIndex = currentIndex <= 0 ? snapPoints.length - 1 : currentIndex - 1;
    }
    
    const target = snapPoints[targetIndex];
    this.fadeAnimateTo(target);
  }

  fadeToDirection(direction) {
    let target;
    if (this.infiniteLoop) {
      // Use same infinite logic for fade
      const snapPoints = this.calculator.snapPoints;
      const currentIndex = snapPoints.findIndex(snap => 
        Math.abs(snap - this.state.currentPosition) < 10
      );
      
      let targetIndex;
      if (direction === 'next') {
        targetIndex = currentIndex >= snapPoints.length - 1 ? 0 : currentIndex + 1;
      } else {
        targetIndex = currentIndex <= 0 ? snapPoints.length - 1 : currentIndex - 1;
      }
      
      target = snapPoints[targetIndex];
    } else {
      if (direction === 'next') {
        target = this.calculator.getNextSnapPoint(this.state.currentPosition);
      } else {
        target = this.calculator.getPrevSnapPoint(this.state.currentPosition);
      }
    }
    
    if (target !== this.state.currentPosition) {
      this.fadeAnimateTo(target);
    }
  }

  fadeAnimateTo(target, duration = SLIDER_CONFIG.SCROLL_DURATION) {
    if (this.state.animationId) cancelAnimationFrame(this.state.animationId);
    
    this.state.isAnimating = true;
    const fadeOutDuration = duration * 0.4; // 40% of time for fade out
    const fadeInDuration = duration * 0.4;  // 40% of time for fade in
    const moveDelay = duration * 0.2;       // 20% pause between
    
    // Fade out
    this.track.style.transition = `opacity ${fadeOutDuration}ms ease-out`;
    this.track.style.opacity = '0';
    
    setTimeout(() => {
      // Move to new position instantly while invisible
      this.state.currentPosition = target;
      this.track.style.transform = `translateX(${-target}px)`;
      
      this.slider.dispatchEvent(new CustomEvent('sliderMoved'));
      
      setTimeout(() => {
        // Fade back in
        this.track.style.transition = `opacity ${fadeInDuration}ms ease-in`;
        this.track.style.opacity = '1';
        
        setTimeout(() => {
          // Clean up
          this.track.style.transition = '';
          this.state.isAnimating = false;
        }, fadeInDuration);
      }, moveDelay);
    }, fadeOutDuration);
  }

  startMomentumScroll() {
    // Removed - no longer using momentum scroll
  }
  
  snapToNearest() {
    if (this.animationType === 'fade') {
      // For fade animation, we're already at a snap point
      return;
    }
    const target = this.calculator.findNearestSnapPoint(this.state.currentPosition);
    this.animateTo(target);
  }

  animateTo(target, duration = SLIDER_CONFIG.SCROLL_DURATION) {
    if (this.state.animationId) cancelAnimationFrame(this.state.animationId);
    
    this.state.isAnimating = true;
    const start = this.state.currentPosition;
    const distance = target - start;
    if (distance === 0) {
      this.state.isAnimating = false;
      return;
    }

    const startTime = performance.now();

    const tick = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = duration === 0 ? 1 : Math.min(elapsed / duration, 1);
      this.state.currentPosition = start + distance * easeOutCubic(progress);
      this.track.style.transform = `translateX(${-this.state.currentPosition}px)`;
      this.slider.dispatchEvent(new CustomEvent('sliderMoved'));
      
      if (progress < 1) {
        this.state.animationId = requestAnimationFrame(tick);
      } else {
        this.state.animationId = null;
        this.state.isAnimating = false;
      }
    };
    this.state.animationId = requestAnimationFrame(tick);
  }

  destroy() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    delete this.slider.sliderInstance;
  }
}

// ============================================================================
// SLIDER DOTS
// ============================================================================

class SliderDots {
  constructor(slider) {
    this.slider = slider;
    this.instance = slider.sliderInstance;
    this.calculator = new SliderCalculator(slider);
    this.dotsContainer = slider.parentElement?.querySelector('.js-slider-dots');
    if (this.dotsContainer) this.init();
  }

  init() {
    this.update();
    this.slider.addEventListener('sliderMoved', () => this.update());
    this.slider.addEventListener('sliderRecalculated', () => this.handleRecalculation());
  }

  handleRecalculation() {
    this.calculator.update();
    this.update();
  }

  update() {
    if (!this.dotsContainer || !this.instance) return;
    
    const slideCount = this.instance.infiniteLoop 
      ? this.instance.originalSlides.length 
      : this.slider.querySelector('.slider-track')?.children.length || 0;
    const slidesToShow = this.calculator.slidesPerView;
    
    // Hide dots if not enough slides
    if (slideCount <= slidesToShow) {
      this.dotsContainer.style.display = 'none';
      return;
    }
    
    this.dotsContainer.style.display = '';
    
    this.dotsContainer.innerHTML = '';
    
    if (this.instance.infiniteLoop) {
      // For infinite loop, create dots based on original slides
      const slideWidth = this.calculator.columnWidth + this.calculator.gap;
      const slidesToDuplicate = Math.max(this.instance.slidesPerView || 1, 1);
      const originalStartPosition = slidesToDuplicate * slideWidth;
      
      for (let i = 0; i < this.instance.originalSlides.length; i++) {
        const dot = document.createElement('button');
        dot.className = 'slider-dot full-unstyled-button';
        dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
        
        const slidePosition = originalStartPosition + (i * slideWidth);
        const threshold = slideWidth / 2;
        if (Math.abs(this.instance.state.currentPosition - slidePosition) < threshold) {
          dot.classList.add('active');
        }
        
        dot.addEventListener('click', () => {
          if (this.instance.animationType === 'fade') {
            this.instance.fadeAnimateTo(slidePosition);
          } else {
            this.instance.animateTo(slidePosition);
          }
        });
        this.dotsContainer.appendChild(dot);
      }
    } else {
      // For finite slider, use snap points logic
      const currentPosition = this.instance.state.currentPosition;
      const snapPoints = this.calculator.snapPoints;

      snapPoints.forEach((snap, index) => {
        const dot = document.createElement('button');
        dot.className = 'slider-dot full-unstyled-button';
        dot.setAttribute('aria-label', `Go to slide ${index + 1}`);
        const threshold = (this.calculator.columnWidth + this.calculator.gap) / 2;
        if (Math.abs(currentPosition - snap) < threshold) {
          dot.classList.add('active');
        }
        
        // Use appropriate animation method based on type
        if (this.instance.animationType === 'fade') {
          dot.addEventListener('click', () => this.instance.fadeAnimateTo(snap));
        } else {
          dot.addEventListener('click', () => this.instance.animateTo(snap));
        }
        this.dotsContainer.appendChild(dot);
      });
    }
  }
}

// ============================================================================
// SLIDER ARROWS
// ============================================================================

class SliderArrows {
  constructor(slider) {
    this.slider = slider;
    this.instance = slider.sliderInstance;
    this.calculator = new SliderCalculator(slider);
    this.prevButton = slider.parentElement?.querySelector('.js-slider-prev');
    this.nextButton = slider.parentElement?.querySelector('.js-slider-next');
    if (this.prevButton && this.nextButton) this.init();
  }

  init() {
    this.prevButton.addEventListener('click', () => this.scrollPrev());
    this.nextButton.addEventListener('click', () => this.scrollNext());
    this.updateButtonStates();
    this.slider.addEventListener('sliderMoved', () => this.updateButtonStates());
    this.slider.addEventListener('sliderRecalculated', () => this.handleRecalculation());
  }

  handleRecalculation() {
    this.calculator.update();
    this.updateButtonStates();
  }

  scrollPrev() {
    if (!this.instance) return;
    this.instance.slideInDirection('prev');
  }

  scrollNext() {
    if (!this.instance) return;
    this.instance.slideInDirection('next');
  }

  updateButtonStates() {
    if (!this.instance) return;
    const slideCount = this.slider.querySelector('.slider-track')?.children.length || 0;
    const slidesToShow = this.calculator.slidesPerView;
    
    // Hide arrows if not enough slides
    if (slideCount <= slidesToShow) {
      this.prevButton.style.display = 'none';
      this.nextButton.style.display = 'none';
      return;
    }
    
    this.prevButton.style.display = '';
    this.nextButton.style.display = '';
    
    // For infinite loop, never disable arrows
    if (this.instance.infiniteLoop) {
      this.prevButton.classList.remove('disabled');
      this.nextButton.classList.remove('disabled');
    } else {
      const maxScroll = this.calculator.snapPoints[this.calculator.snapPoints.length - 1] || 0;
      this.prevButton.classList.toggle('disabled', this.instance.state.currentPosition <= 0);
      this.nextButton.classList.toggle('disabled', this.instance.state.currentPosition >= maxScroll - 1);
    }
  }
}

// ============================================================================
// AUTO-SCROLL SLIDER
// ============================================================================

class AutoScrollSlider {
  constructor(slider) {
    this.slider = slider;
    this.instance = slider.sliderInstance;
    this.calculator = new SliderCalculator(slider);
    this.speed = parseFloat(slider.getAttribute('data-autoplay-speed'));
    if (!this.speed) return;
    this.intervalMs = this.speed * 1000;
    this.isPaused = false;
    this.intervalId = null;
    this.init();
  }

  init() {
    this.intervalId = setInterval(() => this.autoScroll(), this.intervalMs);
    this.slider.addEventListener('mousedown', () => this.pause());
    this.slider.addEventListener('mouseup', () => this.resumeAfterDelay());
    this.slider.addEventListener('mouseenter', () => this.pause());
    this.slider.addEventListener('mouseleave', () => this.resume());
    this.slider.addEventListener('sliderRecalculated', () => this.calculator.update());
  }

  autoScroll() {
    if (!this.isPaused && this.instance) {
      this.instance.slideInDirection('next');
    }
  }

  pause() { this.isPaused = true; }
  resume() { this.isPaused = false; }
  resumeAfterDelay() { setTimeout(() => this.resume(), this.intervalMs); }
}

// ============================================================================
// ACTIVE SLIDES MANAGER
// ============================================================================

class ActiveSlidesManager {
    constructor(slider) {
        this.slider = slider;
        this.track = slider.querySelector('.slider-track');
        this.observer = null;
        if (this.track) this.init();
    }

    init() {
        const slides = Array.from(this.track.children);
        if (!slides.length) return;

        this.observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    entry.target.classList.toggle('active', entry.isIntersecting);
                });
            },
            {
                root: this.slider,
                threshold: 0.5 // Active when 50% visible
            }
        );
        slides.forEach(slide => this.observer.observe(slide));
    }

    destroy() {
        if (this.observer) this.observer.disconnect();
    }
}

// ============================================================================
// INFINITE SLIDER
// ============================================================================

class InfiniteSlider {
  constructor(slider) {
    this.slider = slider;
    this.track = slider.querySelector('.slider-track');
    if (this.track) this.init();
  }

  init() {
    this.updateAnimation();
    window.addEventListener('resize', () => this.updateAnimation());
    const sliderSection = this.slider.parentElement;
    if (sliderSection) {
      sliderSection.addEventListener('focusin', () => { /* Optionally pause */ });
      sliderSection.addEventListener('focusout', () => { /* Optionally resume */ });
    }
  }

  updateAnimation() {
    const trackWidth = this.track.scrollWidth / 2;
    const baseSpeed = parseFloat(this.slider.getAttribute('data-autoplay-speed')) || 30;
    const adjustedSpeed = Math.max(baseSpeed * (trackWidth / 1000), 15);
    this.track.style.animationDuration = `${adjustedSpeed}s`;
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

const initSliders = () => {
  document.querySelectorAll('simple-slider').forEach(slider => {
    console.log('Initializing slider:', slider);
    // DraggableSlider must be first as it provides the instance
    new DraggableSlider(slider); 
    new SliderDots(slider);
    new SliderArrows(slider);
    new AutoScrollSlider(slider);
    new ActiveSlidesManager(slider);
  });

  document.querySelectorAll('.js-infinite-slider').forEach(slider => {
    new InfiniteSlider(slider);
  });
};

document.addEventListener('DOMContentLoaded', initSliders);