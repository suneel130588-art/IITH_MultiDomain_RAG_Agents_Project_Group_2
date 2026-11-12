// Show / hide the password on the sign-in page.
const reveal = document.getElementById("reveal");
const password = document.getElementById("password");
reveal.addEventListener("click", () => {
  const show = password.type === "password";
  password.type = show ? "text" : "password";
  reveal.setAttribute("aria-label", show ? "Hide password" : "Show password");
  reveal.title = reveal.getAttribute("aria-label");
  password.focus();
});
