document.addEventListener('scroll', function() {
  const parallaxElements = document.querySelectorAll('.parallax img');
  const scrollY = window.scrollY;

  parallaxElements.forEach((element, index) => {
    element.style.transform = `translateY(${scrollY * -0.2}px) scale(1.4)`;
  });
});