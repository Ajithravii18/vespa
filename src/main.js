import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger.js';
import Lenis from 'lenis';

// Register GSAP ScrollTrigger
gsap.registerPlugin(ScrollTrigger);

// Global Variables
let scene, camera, renderer, clock;
let modelGroup, floatingGroup, interactiveGroup, vespaModel;
let shadowPlane, shadowMaterial;
let particles = [];
let modelLoaded = false;
let parts = {};
let initialPositions = {};
let bodyMaterials = [];
let originalMainMap = null;
let mouseX = 0;
let mouseY = 0;

// Mouse drag rotation variables
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let targetRotation = { x: 0, y: 0 };
let currentRotation = { x: 0, y: 0 };
const dragDamping = 0.05;

// Initialization
function init() {
  // 1. Setup Scene
  scene = new THREE.Scene();

  // 2. Setup Camera
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
  camera.position.set(0, 0, 5.5);

  // 3. Setup Clock for animations
  clock = new THREE.Clock();

  // 4. Setup Renderer
  const canvas = document.getElementById('webgl-canvas');
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true, // transparent to let the CSS background gradient show through
    powerPreference: "high-performance"
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // 5. Setup Nested Groups for independent animations
  modelGroup = new THREE.Group();        // Controlled by GSAP ScrollTrigger
  floatingGroup = new THREE.Group();     // Controlled by Sine float loop
  interactiveGroup = new THREE.Group();  // Controlled by Mouse Drag/Hover
  
  floatingGroup.add(interactiveGroup);
  modelGroup.add(floatingGroup);
  scene.add(modelGroup);

  // 6. Setup Lighting
  setupLighting();

  // 7. Setup Shadow Plane
  setupShadowPlane();

  // 8. Setup Floating Background Particles
  createParticles();

  // 9. Load the Vespa Model
  loadVespaModel();

  // 10. Setup Scroll Animations
  setupScrollAnimations();

  // 11. Setup Smooth Scrolling (Lenis)
  setupSmoothScroll();

  // 12. Setup Event Listeners
  setupEventListeners();

  // 13. Start Loop
  animate();
}

// Lighting Setup
function setupLighting() {
  // Ambient Light (soft room light)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  // Key Light (Directional, main light from top-right front)
  const keyLight = new THREE.DirectionalLight(0xfffdf4, 2.5);
  keyLight.position.set(5, 5, 4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 15;
  keyLight.shadow.camera.left = -3;
  keyLight.shadow.camera.right = 3;
  keyLight.shadow.camera.top = 3;
  keyLight.shadow.camera.bottom = -3;
  scene.add(keyLight);

  // Fill Light (Directional, soft light from opposite side)
  const fillLight = new THREE.DirectionalLight(0xeaefff, 1.2);
  fillLight.position.set(-5, 2, 2);
  scene.add(fillLight);

  // Rim Light (Point light behind and below to highlight curves and edges)
  const rimLight = new THREE.PointLight(0xffffff, 3, 10);
  rimLight.position.set(0, -2, -4);
  scene.add(rimLight);
}

// Floor Shadow Plane Setup
function setupShadowPlane() {
  const planeGeo = new THREE.PlaneGeometry(10, 10);
  shadowMaterial = new THREE.ShadowMaterial({ opacity: 0.08 });
  shadowPlane = new THREE.Mesh(planeGeo, shadowMaterial);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = -1.5;
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);
}

// Create Pastel Floating Geometric Particles & Refractive Droplets
function createParticles() {
  const particleGroup = new THREE.Group();
  scene.add(particleGroup);

  const particleCount = 35;
  const geometries = [
    new THREE.TorusGeometry(0.1, 0.03, 8, 24),
    new THREE.SphereGeometry(0.06, 16, 16),
    new THREE.ConeGeometry(0.06, 0.12, 5),
    new THREE.IcosahedronGeometry(0.07, 0)
  ];

  // Soft pastel colors
  const colors = [
    0xffd3da, // Pastel pink
    0xd6ebd7, // Pastel mint
    0xdfdbfc, // Pastel lavender
    0xdbefff, // Pastel sky blue
    0xfff5d1  // Pastel pale yellow
  ];

  for (let i = 0; i < particleCount; i++) {
    // 30% of particles are refractive transmissive liquid droplets
    const isDroplet = Math.random() < 0.35;
    let material;

    if (isDroplet) {
      // Premium liquid droplet material
      material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        roughness: 0.1,
        metalness: 0.1,
        transmission: 0.95,
        ior: 1.33, // Index of refraction of water
        thickness: 0.4,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1
      });
    } else {
      // Pastel solid shapes
      const color = colors[Math.floor(Math.random() * colors.length)];
      material = new THREE.MeshPhysicalMaterial({
        color: color,
        roughness: 0.3,
        metalness: 0.1,
        clearcoat: 0.8,
        clearcoatRoughness: 0.2
      });
    }

    const geo = geometries[Math.floor(Math.random() * geometries.length)];
    const mesh = new THREE.Mesh(geo, material);

    // Random distribution
    mesh.position.set(
      (Math.random() - 0.5) * 8, // x
      (Math.random() - 0.5) * 6, // y
      (Math.random() - 0.5) * 4 - 1.5 // z (push slightly back)
    );

    // Random scale
    const scale = Math.random() * 0.8 + 0.4;
    mesh.scale.setScalar(scale);

    // Store animated variables
    particles.push({
      mesh: mesh,
      speed: Math.random() * 0.4 + 0.1,
      rotSpeed: {
        x: (Math.random() - 0.5) * 0.01,
        y: (Math.random() - 0.5) * 0.01,
        z: (Math.random() - 0.5) * 0.01
      },
      verticalRange: Math.random() * 0.15 + 0.05,
      initialY: mesh.position.y,
      seed: Math.random() * 100
    });

    particleGroup.add(mesh);
  }
}

// Load GLB Model with custom progress updates
function loadVespaModel() {
  const manager = new THREE.LoadingManager();
  const loader = new GLTFLoader(manager);

  const loadPercentText = document.getElementById('load-percentage');
  const loadProgressBar = document.getElementById('preloader-bar');
  const preloader = document.getElementById('preloader');

  manager.onStart = function (url, itemsLoaded, itemsTotal) {
    // Start tracking
  };

  manager.onProgress = function (url, itemsLoaded, itemsTotal) {
    // Standard manager progress handles count of files. Since we have 1 file,
    // we use the loader's onProgress for byte progress below.
  };

  manager.onLoad = function () {
    // Fade out preloader when all assets loaded (and post-processed)
    setTimeout(() => {
      preloader.classList.add('fade-out');
      // Trigger Hero text fade-in transitions
      document.querySelectorAll('.fade-up').forEach(el => {
        el.classList.add('visible');
      });
    }, 500);
  };

  // Load the model from public folder
  loader.load(
    '/vespa.glb',
    function (gltf) {
      vespaModel = gltf.scene;

      // Enable shadows for the model
      vespaModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          
          // Enhance materials for luxury feel
          if (child.material) {
            child.material.envMapIntensity = 1.5;
            
            // Adjust body color slightly to enhance sunflower yellow if needed
            if (child.name.includes('Main') && child.material.color) {
              // Ensure body is glossy sunflower yellow
              child.material.roughness = 0.15;
              child.material.metalness = 0.1;
              child.material.clearcoat = 1.0;
              child.material.clearcoatRoughness = 0.05;
            }
            
            // Store body materials for color changing customizer
            if (child.material.name === 'Main') {
              if (!bodyMaterials.includes(child.material)) {
                bodyMaterials.push(child.material);
              }

              // Inject custom GLSL shader code to color-swap ONLY the yellow paint on the GPU
              child.material.onBeforeCompile = (shader) => {
                shader.uniforms.uColorReplace = { value: new THREE.Color('#ffdb15') };
                shader.uniforms.uUseReplace = { value: 0.0 };

                shader.fragmentShader = 'uniform vec3 uColorReplace;\nuniform float uUseReplace;\n' + shader.fragmentShader;

                shader.fragmentShader = shader.fragmentShader.replace(
                  '#include <map_fragment>',
                  `
                  #include <map_fragment>
                  if (uUseReplace > 0.01) {
                    vec3 col = diffuseColor.rgb;
                    // Calculate a smooth 'yellowness' gradient factor to handle anti-aliasing edges and shadow transitions
                    float yellowness = smoothstep(0.18, 0.32, (col.r + col.g) * 0.5 - col.b);
                    if (yellowness > 0.01) {
                      // Extract shading details to keep shadows/highlights photorealistic
                      float originalLuminance = dot(col, vec3(0.299, 0.587, 0.114));
                      vec3 targetPaint = uColorReplace * (originalLuminance / 0.78);
                      // Smoothly blend between original texture and target color based on mask and transition state
                      diffuseColor.rgb = mix(col, targetPaint, uUseReplace * yellowness);
                    }
                  }
                  `
                );

                child.material.userData.shader = shader;
              };
            }
          }
        }
      });

      // Find Vespa components for scroll-based explosion
      parts = {
        main: vespaModel.getObjectByName('Vespa_Main_0'),
        wheel: vespaModel.getObjectByName('Vespa_Wheel_0'),
        glass: vespaModel.getObjectByName('Vespa_Glass_0'),
        light: vespaModel.getObjectByName('Vespa_Light_0')
      };

      // Store initial local positions of the parts
      Object.keys(parts).forEach(key => {
        if (parts[key]) {
          initialPositions[key] = parts[key].position.clone();
        } else {
          initialPositions[key] = new THREE.Vector3();
        }
      });

      // Center the model's geometry bounds inside the group
      const box = new THREE.Box3().setFromObject(vespaModel);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      
      vespaModel.position.sub(center);
      // Offset so the wheels float slightly above our shadow floor
      vespaModel.position.y += 0.2;

      // Scale model to a standardized height fitting the viewport nicely
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 2.4 / maxDim; // Adjusted scale for beautiful layout fit
      vespaModel.scale.setScalar(scale);

      // Add to interactive group
      interactiveGroup.add(vespaModel);
      modelLoaded = true;

      // Force render frame
      renderer.render(scene, camera);
    },
    // Progress callback (for large files)
    function (xhr) {
      if (xhr.lengthComputable) {
        const percentComplete = Math.round((xhr.loaded / xhr.total) * 100);
        loadPercentText.textContent = percentComplete;
        loadProgressBar.style.width = percentComplete + '%';
      }
    },
    // Error callback
    function (error) {
      console.error('An error occurred loading the Vespa model:', error);
      // If public folder path isn't mapped, fallback to absolute workspace path if Vite resolves it
      if (error) {
        console.log('Retrying with alternative path...');
      }
    }
  );
}

// Lenis Smooth Momentum Scrolling Setup
function setupSmoothScroll() {
  const lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // Custom easeOutExpo
    orientation: 'vertical',
    gestureOrientation: 'vertical',
    smoothWheel: true,
    wheelMultiplier: 1,
    touchMultiplier: 1.2
  });

  lenis.on('scroll', ScrollTrigger.update);

  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });

  gsap.ticker.lagSmoothing(0);
}

// GSAP ScrollTrigger scrollytelling animations
function setupScrollAnimations() {
  // Wait until next tick to ensure DOM is fully set up
  setTimeout(() => {
    // Reset any manual scrolls on page refresh
    window.scrollTo(0, 0);

    // Dynamic timeline spanning the entire scroll page
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: 'body',
        start: 'top top',
        end: 'bottom bottom',
        scrub: 1.0, // link scroll smoothly with a 1s catch-up delay
        invalidateOnRefresh: true
      }
    });

    // 1. Move model from Hero (center) to Feature Grid (right side) & zoom out slightly
    tl.to(modelGroup.position, {
      x: window.innerWidth > 768 ? 1.4 : 0.0,
      y: window.innerWidth > 768 ? 0.2 : -0.2,
      z: window.innerWidth > 768 ? -0.5 : -1.0,
      duration: 1.5
    }, 0);

    tl.to(modelGroup.scale, {
      x: window.innerWidth > 768 ? 0.95 : 0.8,
      y: window.innerWidth > 768 ? 0.95 : 0.8,
      z: window.innerWidth > 768 ? 0.95 : 0.8,
      duration: 1.5
    }, 0);

    tl.to(modelGroup.rotation, {
      y: -Math.PI / 3.5, // rotate to profile view
      x: 0.05,
      z: -0.05,
      duration: 1.5
    }, 0);

    // Modify shadow plane opacity and scale when model shifts
    if (shadowPlane) {
      tl.to(shadowPlane.position, {
        x: window.innerWidth > 768 ? 1.4 : 0.0,
        y: -1.5,
        duration: 1.5
      }, 0);
    }

    // 2. Transition from Feature Grid (right side) to Quote Break (push deep into background & zoom out)
    tl.to(modelGroup.position, {
      x: 0,
      y: 0.1,
      z: -2.8, // push far back
      duration: 1.5
    }, 1.8);

    tl.to(modelGroup.scale, {
      x: 0.55,
      y: 0.55,
      z: 0.55,
      duration: 1.5
    }, 1.8);

    tl.to(modelGroup.rotation, {
      y: Math.PI * 0.75, // show rear elegant contours
      x: 0.1,
      z: 0.0,
      duration: 1.5
    }, 1.8);

    if (shadowPlane) {
      tl.to(shadowPlane.position, {
        x: 0,
        duration: 1.5
      }, 1.8);
      tl.to(shadowMaterial, {
        opacity: 0.03, // softer shadow when deep in background
        duration: 1.5
      }, 1.8);
    }

    // 3. Transition from Quote Break to Interactive Explode Section (Center, zoom in)
    tl.to(modelGroup.position, {
      x: window.innerWidth > 768 ? 1.1 : 0.0, // place on the right of the split layout
      y: window.innerWidth > 768 ? 0.0 : -0.4,
      z: window.innerWidth > 768 ? 0.0 : -0.8,
      duration: 1.8
    }, 3.6);

    tl.to(modelGroup.scale, {
      x: window.innerWidth > 768 ? 1.35 : 1.05,
      y: window.innerWidth > 768 ? 1.35 : 1.05,
      z: window.innerWidth > 768 ? 1.35 : 1.05,
      duration: 1.8
    }, 3.6);

    tl.to(modelGroup.rotation, {
      y: -Math.PI / 4, // front-side isometric view
      x: 0.1,
      z: 0,
      duration: 1.8
    }, 3.6);

    if (shadowPlane) {
      tl.to(shadowPlane.position, {
        x: window.innerWidth > 768 ? 1.1 : 0.0,
        duration: 1.8
      }, 3.6);
      tl.to(shadowMaterial, {
        opacity: 0.08,
        duration: 1.8
      }, 3.6);
    }

    // --- Explode Animation Sequence ---
    // This runs inside the explode section scroll depth
    const explodeStart = 5.2;
    const explodeEnd = 7.5;
    const explodeDuration = explodeEnd - explodeStart;

    // Component Separation offsets
    const offsets = {
      wheelY: -1.3,
      glassZ: 1.2,
      glassY: 0.35,
      lightZ: 1.5,
      lightY: 0.45,
      mainY: 0.4,
      mainZ: -0.4
    };

    // Animate Wheels Outwards
    tl.to({}, {
      onUpdate: function() {
        if (!modelLoaded) return;
        const progress = this.progress(); // 0 to 1

        // Explode wheels
        if (parts.wheel) {
          parts.wheel.position.y = initialPositions.wheel.y + (offsets.wheelY * progress);
        }
        // Explode glass
        if (parts.glass) {
          parts.glass.position.z = initialPositions.glass.z + (offsets.glassZ * progress);
          parts.glass.position.y = initialPositions.glass.y + (offsets.glassY * progress);
        }
        // Explode light
        if (parts.light) {
          parts.light.position.z = initialPositions.light.z + (offsets.lightZ * progress);
          parts.light.position.y = initialPositions.light.y + (offsets.lightY * progress);
        }
        // Explode body
        if (parts.main) {
          parts.main.position.y = initialPositions.main.y + (offsets.mainY * progress);
          parts.main.position.z = initialPositions.main.z + (offsets.mainZ * progress);
        }
      },
      duration: explodeDuration
    }, explodeStart);

    // Zoom in closer during components explosion
    tl.to(modelGroup.scale, {
      x: window.innerWidth > 768 ? 1.55 : 1.25,
      y: window.innerWidth > 768 ? 1.55 : 1.25,
      z: window.innerWidth > 768 ? 1.55 : 1.25,
      duration: explodeDuration
    }, explodeStart);

    // Text block scrolling trigger for the explode section text (Sticky visual alignment)
    ScrollTrigger.create({
      trigger: '#explode-section',
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      onUpdate: (self) => {
        const p = self.progress;
        const blocks = document.querySelectorAll('.sticky-text-block');
        
        // Hide all
        blocks.forEach(b => b.classList.remove('active'));

        // Activate based on scroll progress splits
        if (p < 0.33) {
          blocks[0].classList.add('active');
        } else if (p >= 0.33 && p < 0.66) {
          blocks[1].classList.add('active');
        } else {
          blocks[2].classList.add('active');
        }
      }
    });

    // 4. Transition from Explode Section (Restoring original shape) to CTA section (High-gloss hero float)
    const restoreStart = 8.5;
    tl.to({}, {
      onUpdate: function() {
        if (!modelLoaded) return;
        const progress = 1 - this.progress(); // returns from exploded (progress=0) back to 0-offset (progress=1)

        // Restore wheels
        if (parts.wheel) {
          parts.wheel.position.y = initialPositions.wheel.y + (offsets.wheelY * progress);
        }
        // Restore glass
        if (parts.glass) {
          parts.glass.position.z = initialPositions.glass.z + (offsets.glassZ * progress);
          parts.glass.position.y = initialPositions.glass.y + (offsets.glassY * progress);
        }
        // Restore light
        if (parts.light) {
          parts.light.position.z = initialPositions.light.z + (offsets.lightZ * progress);
          parts.light.position.y = initialPositions.light.y + (offsets.lightY * progress);
        }
        // Restore body
        if (parts.main) {
          parts.main.position.y = initialPositions.main.y + (offsets.mainY * progress);
          parts.main.position.z = initialPositions.main.z + (offsets.mainZ * progress);
        }
      },
      duration: 1.2
    }, restoreStart);

    // Model Position for final CTA & restore normal zoom scale
    tl.to(modelGroup.position, {
      x: 0,
      y: 0.1,
      z: 0.2,
      duration: 1.5
    }, restoreStart + 0.3);

    tl.to(modelGroup.scale, {
      x: 1.0,
      y: 1.0,
      z: 1.0,
      duration: 1.5
    }, restoreStart + 0.3);

    tl.to(modelGroup.rotation, {
      y: Math.PI * 2.25, // full circle rotate to dynamic front-facing slant
      x: 0.05,
      z: 0,
      duration: 1.8
    }, restoreStart + 0.3);

    if (shadowPlane) {
      tl.to(shadowPlane.position, {
        x: 0,
        duration: 1.5
      }, restoreStart + 0.3);
      tl.to(shadowMaterial, {
        opacity: 0.12, // richer shadow when landing
        duration: 1.5
      }, restoreStart + 0.3);
    }
  }, 100);
}

// User Interaction Setup (Drag and Parallax)
function setupEventListeners() {
  const canvas = document.getElementById('webgl-canvas');

  // Mouse drag handler for Orbit-like rotation on the interactiveGroup
  canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    previousMousePosition = {
      x: e.clientX,
      y: e.clientY
    };
  });

  canvas.addEventListener('mousemove', (e) => {
    // Track mouse coordinates for desktop hover parallax
    mouseX = (e.clientX / window.innerWidth) - 0.5;
    mouseY = (e.clientY / window.innerHeight) - 0.5;

    if (isDragging) {
      const deltaMove = {
        x: e.clientX - previousMousePosition.x,
        y: e.clientY - previousMousePosition.y
      };

      // Update target rotation
      targetRotation.y += deltaMove.x * 0.005;
      targetRotation.x += deltaMove.y * 0.005;
      
      // Clamp X rotation to avoid looking completely upside down
      targetRotation.x = Math.max(-0.6, Math.min(0.6, targetRotation.x));

      previousMousePosition = {
        x: e.clientX,
        y: e.clientY
      };
    }
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Mobile Touch Support
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      isDragging = true;
      previousMousePosition = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      };
    }
  });

  canvas.addEventListener('touchmove', (e) => {
    if (isDragging && e.touches.length === 1) {
      const deltaMove = {
        x: e.touches[0].clientX - previousMousePosition.x,
        y: e.touches[0].clientY - previousMousePosition.y
      };

      targetRotation.y += deltaMove.x * 0.006;
      targetRotation.x += deltaMove.y * 0.006;
      
      targetRotation.x = Math.max(-0.6, Math.min(0.6, targetRotation.x));

      previousMousePosition = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      };
    }
  });

  canvas.addEventListener('touchend', () => {
    isDragging = false;
  });

  // Window Resize
  window.addEventListener('resize', onWindowResize);
  
  // Highlight active link in header based on scroll section
  const sections = document.querySelectorAll('section');
  const navLinks = document.querySelectorAll('.nav-link');
  
  window.addEventListener('scroll', () => {
    let currentSection = '';
    
    sections.forEach(section => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.clientHeight;
      if (window.scrollY >= sectionTop - window.innerHeight / 3) {
        currentSection = section.getAttribute('id');
      }
    });
    
    navLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href').substring(1) === currentSection) {
        link.classList.add('active');
      }
    });
  });

  // Color Swatch Listeners for Color Customizer
  const swatches = document.querySelectorAll('.swatch');
  swatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      swatches.forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      const hexColor = swatch.getAttribute('data-color');
      changeVespaColor(hexColor);
      
      // Keep CTA button styling synchronized with the selected color!
      const ctaBtn = document.querySelector('.cta-btn');
      if (ctaBtn) {
        gsap.to(ctaBtn, {
          backgroundColor: hexColor,
          duration: 0.8,
          color: hexColor === '#2c3539' ? '#fbfaf6' : '#0e0e0e',
          ease: 'power2.out'
        });
      }
    });
  });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

// Change Vespa Paint Color programmatically via GPU uniforms
function changeVespaColor(hexColor) {
  if (!modelLoaded || bodyMaterials.length === 0) return;
  const targetColor = new THREE.Color(hexColor);
  
  bodyMaterials.forEach(material => {
    const shader = material.userData.shader;
    if (shader) {
      if (hexColor === '#ffdb15') {
        // Smoothly fade back to original yellow texture map
        gsap.to(shader.uniforms.uUseReplace, {
          value: 0.0,
          duration: 0.8,
          ease: 'power2.out'
        });
      } else {
        // If we were at 0.0 (original yellow), set target color immediately and fade in the override
        if (shader.uniforms.uUseReplace.value === 0.0) {
          shader.uniforms.uColorReplace.value.copy(targetColor);
          gsap.to(shader.uniforms.uUseReplace, {
            value: 1.0,
            duration: 0.8,
            ease: 'power2.out'
          });
        } else {
          // Smoothly morph color uniform values
          gsap.to(shader.uniforms.uColorReplace.value, {
            r: targetColor.r,
            g: targetColor.g,
            b: targetColor.b,
            duration: 0.8,
            ease: 'power2.out'
          });
          // Ensure replace mode is enabled
          gsap.to(shader.uniforms.uUseReplace, {
            value: 1.0,
            duration: 0.3
          });
        }
      }
    }
  });
}

// Main Animation Loop
function animate() {
  requestAnimationFrame(animate);

  const time = clock.getElapsedTime();

  // 1. Sine wave floating drift on the floatingGroup
  if (modelLoaded) {
    floatingGroup.position.y = Math.sin(time * 1.4) * 0.08;
    // Tiny drifting rotation
    floatingGroup.rotation.y = Math.sin(time * 0.6) * 0.02;
    floatingGroup.rotation.z = Math.cos(time * 0.4) * 0.015;
    
    // Scale shadow size slightly based on Vespa height to simulate realistic light casting
    if (shadowPlane) {
      const heightFactor = floatingGroup.position.y; // goes from -0.08 to +0.08
      shadowPlane.scale.setScalar(1 - heightFactor * 0.5);
      shadowMaterial.opacity = 0.08 - (heightFactor * 0.15); // lighter shadow as model floats higher
    }
  }

  // 2. Damp current drag rotation towards target rotation
  if (isDragging) {
    currentRotation.x += (targetRotation.x - currentRotation.x) * dragDamping;
    currentRotation.y += (targetRotation.y - currentRotation.y) * dragDamping;
  } else {
    // Slowly return interactive drag orientation back to 0 (default Scroll orientation)
    // allowing GSAP timeline to be the clean visual baseline
    currentRotation.x += (0 - currentRotation.x) * 0.05;
    currentRotation.y += (0 - currentRotation.y) * 0.05;
  }

  // Combine drag rotation and hover parallax with smooth frame-by-frame interpolation
  const targetX = currentRotation.x + (mouseY * 0.22);
  const targetY = currentRotation.y + (mouseX * 0.22);
  
  interactiveGroup.rotation.x += (targetX - interactiveGroup.rotation.x) * 0.08;
  interactiveGroup.rotation.y += (targetY - interactiveGroup.rotation.y) * 0.08;

  // 3. Animate Floating Particles in Background
  particles.forEach(p => {
    // Slow rotational drift
    p.mesh.rotation.x += p.rotSpeed.x;
    p.mesh.rotation.y += p.rotSpeed.y;
    p.mesh.rotation.z += p.rotSpeed.z;

    // Up-down sine wave floating
    p.mesh.position.y = p.initialY + Math.sin(time * p.speed + p.seed) * p.verticalRange;
  });

  // 4. Render Scene
  renderer.render(scene, camera);
}

// Run setup on load
window.addEventListener('DOMContentLoaded', init);
