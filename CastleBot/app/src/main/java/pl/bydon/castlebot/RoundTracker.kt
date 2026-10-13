package pl.bydon.castlebot

/**
 * HUD OCR frequently confuses e.g. 4/24 and 8/24.
 * Never regress within a match. A jump over a round needs two observations.
 * The first number also needs two observations to avoid acting on garbage.
 */
class RoundTracker {
    var current: Int? = null
        private set
    private var lastSeen = 0L
    private var candidate = -1
    private var candidateHits = 0
    private var candidateAt = 0L

    fun reset() {
        current = null
        lastSeen = 0L
        candidate = -1
        candidateHits = 0
        candidateAt = 0L
    }

    fun observe(value: Int?, timeMs: Long): Int? {
        if (value != null && value in 1..24) {
            val active = current
            when {
                active != null && value == active -> {
                    lastSeen = timeMs
                    candidate = -1
                    candidateHits = 0
                }
                active != null && value < active -> {
                    // One out-of-order number never changes the active round.
                }
                active != null && value == active + 1 -> confirm(value, timeMs)
                else -> {
                    if (candidate == value && timeMs-candidateAt in 1..9000L) {
                        candidateHits++
                        candidateAt = timeMs
                    } else {
                        candidate = value
                        candidateHits = 1
                        candidateAt = timeMs
                    }
                    if (candidateHits >= 2) confirm(value, timeMs)
                }
            }
        }
        return current?.takeIf { timeMs-lastSeen < 35000L }
    }

    private fun confirm(value: Int,timeMs: Long) {
        current = value
        lastSeen = timeMs
        candidate = -1
        candidateHits = 0
    }
}
