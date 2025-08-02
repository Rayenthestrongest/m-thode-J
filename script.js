
// Feedback visuel sur ajout
function flashCard(card) {
    card.style.transition = "background-color 1s";
    card.style.backgroundColor = "#c8f7c5";
    setTimeout(() => {
        card.style.backgroundColor = "";
    }, 1000);
}

// Ajout de badges pour chaque carte contenant "cours du"
document.addEventListener("DOMContentLoaded", () => {
    const cards = document.querySelectorAll(".revision-card");
    cards.forEach(card => {
        if (!card.querySelector(".j-badge")) {
            const badge = document.createElement("span");
            badge.className = "j-badge";
            badge.innerText = "J?";
            card.insertBefore(badge, card.firstChild);
        }
    });
});
