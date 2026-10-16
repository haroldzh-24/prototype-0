Pod::Spec.new do |s|
  s.name = 'DiagramImport'
  s.version = '1.0.0'
  s.summary = 'Local stage diagram document preparation'
  s.description = 'PDF page rendering, paper boundaries and perspective correction.'
  s.license = { :type => 'MIT' }
  s.author = 'Prototype'
  s.homepage = 'https://docs.expo.dev/modules/'
  s.source = { :git => '' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'PDFKit', 'Vision', 'CoreImage', 'AVFoundation', 'UIKit', 'ImageIO', 'QuickLook'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
