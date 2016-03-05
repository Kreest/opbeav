import static com.google.common.base.Charsets.UTF_8;

import com.google.template.soy.SoyFileSet;
import com.google.template.soy.data.SoyMapData;
import com.google.template.soy.data.SanitizedContent;
import com.google.template.soy.tofu.SoyTofu;

import java.io.File;

import com.google.common.collect.ImmutableMap;
import com.google.common.collect.ImmutableList;
import com.google.common.io.Files;

public class WriteSvg {

  // Yay static
  private static SoyTofu tofu;

  public static void main (String[] args) throws Exception {

    // Bundle the Soy files for your project into a SoyFileSet.
    SoyFileSet.Builder sfs = SoyFileSet.builder();
    sfs.add(new File("src/windmill.soy"));
    sfs.setCompileTimeGlobals(new File("dist/soyglobals.txt"));

    // Compile the template into a SoyTofu object.
    // SoyTofu's newRenderer method returns an object that can render any template in the file set.
    tofu = sfs.build().compileToTofu();

    Files.write(
        tofu.newRenderer("windmill.templates.icons")
            .render(),
        new File("static/witness.svg"),
        UTF_8);
    Files.write(
        tofu.newRenderer("windmill.templates.logo")
            .render(),
        new File("static/logo.svg"),
        UTF_8);
  }
}
