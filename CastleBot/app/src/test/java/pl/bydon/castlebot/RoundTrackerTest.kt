package pl.bydon.castlebot

import org.junit.Assert.*
import org.junit.Test

class RoundTrackerTest {
    @Test fun acceptsFirstRoundAfterTwoReads() {
        val tracker=RoundTracker()
        assertNull(tracker.observe(2,1000))
        assertEquals(2,tracker.observe(2,3200))
    }
    @Test fun rejectsSingleErroneousJump() {
        val tracker=RoundTracker()
        tracker.observe(3,1000)
        tracker.observe(3,3200)
        assertEquals(3,tracker.observe(8,5500))
        assertEquals(3,tracker.observe(5,7700))
        assertEquals(3,tracker.current)
    }
    @Test fun acceptsProgressionAndRepeatedJump() {
        val tracker=RoundTracker()
        tracker.observe(3,1000)
        tracker.observe(3,3000)
        assertEquals(4,tracker.observe(4,5000))
        tracker.observe(6,7100)
        assertEquals(6,tracker.observe(6,9200))
    }
    @Test fun rejectsRegressAndExpiresStaleCache() {
        val tracker=RoundTracker()
        tracker.observe(5,1000)
        tracker.observe(5,3000)
        assertEquals(5,tracker.observe(2,5100))
        assertNull(tracker.observe(null,39000))
    }
    @Test fun resetAllowsFreshMatch() {
        val tracker=RoundTracker()
        tracker.observe(20,1000)
        tracker.observe(20,3000)
        tracker.reset()
        assertNull(tracker.observe(1,5000))
        assertEquals(1,tracker.observe(1,7000))
    }
}
