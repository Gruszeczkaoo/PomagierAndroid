package pl.bydon.castlebot

import android.graphics.Bitmap
import android.graphics.Color
import java.util.ArrayDeque
import kotlin.math.abs

data class UnitMarker(val x: Float, val y: Float, val confidence: Int)

/**
 * Recognizes the WHITE downward arrow above the selected friendly character.
 * Suppresses unrelated white blobs near the floor, roofs, UI or background.
 * A failure returns null rather than guessing where to touch.
 */
object BattleVision {
    fun detectSelectedUnit(b: Bitmap): UnitMarker? {
        val w=b.width
        val h=b.height
        if (w<=h || w<500 || h<250) return null

        val step=2
        val left=(w*.19f).toInt()
        val top=(h*.35f).toInt()
        val right=(w*.62f).toInt()
        val bottom=(h*.68f).toInt()
        val nx=((right-left)/step).coerceAtLeast(1)
        val ny=((bottom-top)/step).coerceAtLeast(1)
        val mask=BooleanArray(nx*ny)
        val seen=BooleanArray(nx*ny)
        for (j in 0 until ny) for (i in 0 until nx) {
            val color=b.getPixel(left+i*step,top+j*step)
            val r=Color.red(color)
            val g=Color.green(color)
            val blue=Color.blue(color)
            mask[j*nx+i]=r>242 && g>242 && blue>237 &&
                abs(r-g)<16 && abs(g-blue)<19
        }
        val queue=ArrayDeque<Int>()
        var best: UnitMarker?=null
        var bestScore=0
        for (start in mask.indices) {
            if (!mask[start] || seen[start]) continue
            seen[start]=true
            queue.clear()
            queue.add(start)
            var n=0
            var minX=Int.MAX_VALUE
            var maxX=-1
            var minY=Int.MAX_VALUE
            var maxY=-1
            val rowSizes=IntArray(ny)
            while (queue.isNotEmpty() && n<900) {
                val k=queue.removeFirst()
                val x=k%nx
                val y=k/nx
                n++
                minX=minOf(minX,x); maxX=maxOf(maxX,x)
                minY=minOf(minY,y); maxY=maxOf(maxY,y)
                rowSizes[y]++
                fun visit(p:Int) {
                    if (p>=0 && p<mask.size && mask[p] && !seen[p]) {
                        seen[p]=true;queue.addLast(p)
                    }
                }
                if (x>0)visit(k-1)
                if (x<nx-1)visit(k+1)
                if (y>0)visit(k-nx)
                if (y<ny-1)visit(k+nx)
            }
            val bw=(maxX-minX+1)*step
            val bh=(maxY-minY+1)*step
            if (n !in 30..320 || bw !in 16..53 || bh !in 18..55) continue
            if (bw*10 < bh*4 || bh*10 < bw*6) continue
            val cx=left+(minX+maxX)*step/2
            val cy=top+(minY+maxY)*step/2
            if (cx !in (w*.20f).toInt()..(w*.60f).toInt()) continue
            if (cy !in (h*.38f).toInt()..(h*.63f).toInt()) continue
            val span=(maxY-minY+1).coerceAtLeast(1)
            val upper= (minY until minY+span/3).sumOf{rowSizes[it]}
            val mid= (minY+span/3 until minY+2*span/3).sumOf{rowSizes[it]}
            val bottomRows=(minY+2*span/3..maxY).sumOf{rowSizes[it]}
            // A downward arrow has a narrow shaft, wider middle/wings and tip.
            if (mid<upper || mid<bottomRows/2) continue
            val score=(100.0 -
                abs(cx/w.toDouble()-.43)*90.0 -
                abs(cy/h.toDouble()-.50)*95.0 +
                n*.045).toInt()
            if (score >= 70 && score>bestScore) {
                bestScore=score
                val unitX=cx/w.toFloat()
                val unitY=((top+maxY*step+h*.07f)/h).coerceIn(0f,1f)
                best=UnitMarker(unitX,unitY,score)
            }
        }
        return best
    }
}
