const picker = document.getElementById("cover");
const preview = document.getElementById("cover-preview");
const original = preview.getAttribute("src");
const remove = document.querySelector(".photo-remove input");
let previewURL;

picker.addEventListener("change", () => {
  if (previewURL) URL.revokeObjectURL(previewURL);
  const file = picker.files[0];
  previewURL = file ? URL.createObjectURL(file) : null;
  if (file && remove) remove.checked = false;
  const source = previewURL || original;
  if (source) preview.src = source;
  else preview.removeAttribute("src");
  preview.hidden = !source;
});
